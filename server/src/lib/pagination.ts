export const DEFAULT_PAGE_SIZE = 20;

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function parsePageParams(input: {
  page?: string | number;
  pageSize?: string | number;
}) {
  const page = Math.max(1, Number(input.page || 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(input.pageSize || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function toPageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
