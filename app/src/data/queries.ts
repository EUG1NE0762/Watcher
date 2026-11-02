import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const queryKeys = {
  areas: ['areas'] as const,
  area: (id: string) => ['area', id] as const,
  myReports: ['my-reports'] as const,
};

/** All areas with their scores. Persisted to disk, so the map and search work offline. */
export function useAreas() {
  return useQuery({ queryKey: queryKeys.areas, queryFn: api.listAreas, staleTime: 5 * 60 * 1000 });
}

export function useAreaDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.area(id ?? ''),
    queryFn: async () => {
      const detail = await api.getAreaDetail(id!);
      if (!detail) throw new Error('not_found');
      return detail;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
