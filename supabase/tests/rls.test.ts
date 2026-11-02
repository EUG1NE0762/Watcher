import type { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asRole, createTestDb } from './helpers/pg';

const AREAS_DIR = join(__dirname, '..', 'seed', 'data', 'areas');
const SEEDED_AREAS = readdirSync(AREAS_DIR)
  .filter((f) => f.endsWith('.json'))
  .reduce((n, f) => n + (JSON.parse(readFileSync(join(AREAS_DIR, f), 'utf8')) as unknown[]).length, 0);

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';

let db: PGlite;

async function rows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return (await db.query<T>(sql)).rows;
}

async function expectDenied(role: 'anon' | 'authenticated', user: string | null, sql: string) {
  await expect(asRole(db, role, user, () => db.query(sql))).rejects.toThrow(/permission denied|row-level security|violates/);
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  await db.exec(`insert into auth.users (id) values ('${ALICE}'), ('${BOB}');`);
  // Rows written by the service role (the test connection owns the tables, so it bypasses RLS).
  await db.exec(`
    insert into public.incidents (id, area_id, category, severity, occurred_at, published_at, source_id, source_url, summary, confidence, status, raw_text_hash)
    values ('pending-1', 'lsk-kanyama', 'theft', 2, now(), now(), 'zps', 'https://www.zambiapolice.gov.zm/p', 'Pending record awaiting review', 'low', 'pending', 'h-pending'),
           ('rejected-1', 'lsk-kanyama', 'theft', 2, now(), now(), 'zps', 'https://www.zambiapolice.gov.zm/r', 'Rejected record from review', 'low', 'rejected', 'h-rejected');
    insert into public.saved_places (user_id, area_id) values ('${ALICE}', 'lsk-cbd'), ('${BOB}', 'lsk-soweto');
    insert into public.trips_checked (user_id, kind, area_id) values ('${ALICE}', 'area', 'lsk-cbd');
    insert into public.community_reports (user_id, area_id, type, note) values ('${ALICE}', 'lsk-cbd', 'theft', 'Phone snatched at the corner');
  `);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('triggers', () => {
  it('creates a profile for each new auth user', async () => {
    expect(await rows(`select id, role, is_moderator from public.profiles order by id`)).toEqual([
      { id: ALICE, role: 'visitor', is_moderator: false },
      { id: BOB, role: 'visitor', is_moderator: false },
    ]);
  });
});

describe('public reference data', () => {
  it('anon can read areas (with GeoJSON polygon), scores and sources', async () => {
    await asRole(db, 'anon', null, async () => {
      const areas = await rows<{ id: string; polygon: number[][] }>(`select id, polygon from public.areas_public`);
      expect(areas.length).toBe(SEEDED_AREAS);
      expect(areas[0]!.polygon.length).toBeGreaterThan(3);
      // one score per area per time band
      expect((await rows(`select * from public.risk_scores`)).length).toBe(SEEDED_AREAS * 4);
      expect((await rows(`select * from public.sources`)).length).toBeGreaterThan(5);
    });
  });

  it('only verified incidents are visible to clients', async () => {
    await asRole(db, 'anon', null, async () => {
      expect(await rows(`select distinct status from public.incidents`)).toEqual([{ status: 'verified' }]);
    });
    await asRole(db, 'authenticated', ALICE, async () => {
      expect(await rows(`select id from public.incidents where id in ('pending-1', 'rejected-1')`)).toEqual([]);
    });
  });

  it('clients cannot write incidents, scores, areas or sources', async () => {
    const insertIncident = `insert into public.incidents (area_id, category, severity, occurred_at, published_at, source_id, source_url, summary, confidence, status, raw_text_hash)
      values ('lsk-cbd', 'theft', 2, now(), now(), 'zps', 'https://www.zambiapolice.gov.zm/x', 'Fabricated record attempt', 'high', 'verified', 'h-x')`;
    await expectDenied('anon', null, insertIncident);
    await expectDenied('authenticated', ALICE, insertIncident);
    await expectDenied('authenticated', ALICE, `update public.risk_scores set score = 0, rating = 'low'`);
    await expectDenied('authenticated', ALICE, `delete from public.areas`);
    await expectDenied(
      'authenticated',
      ALICE,
      `insert into public.sources (id, name, type, base_url, credibility_weight) values ('x', 'x', 'official', 'https://x.example', 1)`,
    );
  });

  it('ingestion_runs are invisible to clients', async () => {
    await db.exec(`insert into public.ingestion_runs (stats) values ('{}')`);
    await expectDenied('authenticated', ALICE, `select * from public.ingestion_runs`);
  });
});

describe('user-owned data is private', () => {
  it('saved places and history are visible only to their owner', async () => {
    await asRole(db, 'authenticated', BOB, async () => {
      expect(await rows(`select area_id from public.saved_places`)).toEqual([{ area_id: 'lsk-soweto' }]);
      expect(await rows(`select * from public.trips_checked`)).toEqual([]);
    });
  });

  it('users cannot write or delete rows for someone else', async () => {
    await expectDenied('authenticated', BOB, `insert into public.saved_places (user_id, area_id) values ('${ALICE}', 'lsk-kanyama')`);
    // RLS silently filters other users' rows out of deletes.
    await asRole(db, 'authenticated', BOB, () => db.query(`delete from public.saved_places where user_id = '${ALICE}'`));
    expect((await rows(`select * from public.saved_places where user_id = '${ALICE}'`)).length).toBe(1);
  });

  it('community reports: owner can read, nobody else; no direct inserts', async () => {
    await asRole(db, 'authenticated', ALICE, async () => {
      expect((await rows(`select * from public.community_reports`)).length).toBe(1);
    });
    await asRole(db, 'authenticated', BOB, async () => {
      expect(await rows(`select * from public.community_reports`)).toEqual([]);
    });
    await expectDenied('anon', null, `select * from public.community_reports`);
    await expectDenied(
      'authenticated',
      ALICE,
      `insert into public.community_reports (user_id, area_id, type, note) values ('${ALICE}', 'lsk-cbd', 'theft', 'bypassing the edge function')`,
    );
  });

  it('area_community_reports exposes report content but never who sent it or where they were', async () => {
    await asRole(db, 'anon', null, async () => {
      const r = await rows<Record<string, unknown>>(`select * from public.area_community_reports('lsk-cbd')`);
      expect(r).toHaveLength(1);
      expect(Object.keys(r[0]!).sort()).toEqual(['corroborated', 'created_at', 'id', 'note', 'status', 'type']);
    });
  });

  it('a user cannot make themselves a moderator or edit another profile', async () => {
    await expectDenied('authenticated', ALICE, `update public.profiles set is_moderator = true where id = '${ALICE}'`);
    await asRole(db, 'authenticated', ALICE, async () => {
      await db.query(`update public.profiles set role = 'driver', language = 'ny' where id = '${ALICE}'`);
      await db.query(`update public.profiles set role = 'driver' where id = '${BOB}'`);
    });
    expect(await rows(`select id, role from public.profiles order by id`)).toEqual([
      { id: ALICE, role: 'driver' },
      { id: BOB, role: 'visitor' },
    ]);
  });

  it('delete_my_account removes the user and all their data', async () => {
    await asRole(db, 'authenticated', ALICE, () => db.query(`select public.delete_my_account()`));
    expect(await rows(`select * from auth.users where id = '${ALICE}'`)).toEqual([]);
    expect(await rows(`select * from public.saved_places where user_id = '${ALICE}'`)).toEqual([]);
    expect(await rows(`select * from public.community_reports where user_id = '${ALICE}'`)).toEqual([]);
    expect(await rows(`select * from public.profiles where id = '${ALICE}'`)).toEqual([]);
  });

  it('anon cannot call delete_my_account', async () => {
    await expectDenied('anon', null, `select public.delete_my_account()`);
  });
});

describe('schema guards', () => {
  it('a verified incident must have an area and a valid source URL', async () => {
    await expect(
      db.query(`insert into public.incidents (category, severity, occurred_at, published_at, source_id, source_url, summary, confidence, status, raw_text_hash)
        values ('theft', 2, now(), now(), 'zps', 'https://www.zambiapolice.gov.zm/a', 'No area but verified', 'high', 'verified', 'h-a')`),
    ).rejects.toThrow(/verified_has_area/);
    await expect(
      db.query(`insert into public.incidents (area_id, category, severity, occurred_at, published_at, source_id, source_url, summary, confidence, status, raw_text_hash)
        values ('lsk-cbd', 'theft', 2, now(), now(), 'zps', 'not-a-url', 'Bad url record here', 'high', 'pending', 'h-b')`),
    ).rejects.toThrow(/check constraint/);
  });

  it('area_at_point finds the containing area', async () => {
    expect(await rows(`select public.area_at_point(-15.437, 28.244) as id`)).toEqual([{ id: 'lsk-kanyama' }]);
  });

  it('every seeded incident is demo-labelled and attributed to the demo source', async () => {
    expect(
      await rows(`select count(*)::int as n from public.incidents where status = 'verified' and (not is_demo or source_id <> 'demo')`),
    ).toEqual([{ n: 0 }]);
  });
});
