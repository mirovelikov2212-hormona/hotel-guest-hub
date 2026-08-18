export const MASSAGE_NATIVE_AVAILABILITY_PAGE_SIZE = 1000;
export const MASSAGE_NATIVE_AVAILABILITY_MAX_PAGES = 100;

export async function collectMassageNativeAvailabilityPages(
  fetchPage,
  options = {},
) {
  if (typeof fetchPage !== "function") {
    throw new TypeError("MASSAGE_NATIVE_AVAILABILITY_PAGE_FETCHER_REQUIRED");
  }

  const pageSize = options.pageSize ?? MASSAGE_NATIVE_AVAILABILITY_PAGE_SIZE;
  const maxPages = options.maxPages ?? MASSAGE_NATIVE_AVAILABILITY_MAX_PAGES;

  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError("MASSAGE_NATIVE_AVAILABILITY_PAGE_SIZE_INVALID");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new RangeError("MASSAGE_NATIVE_AVAILABILITY_MAX_PAGES_INVALID");
  }

  const rows = [];

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const from = pageIndex * pageSize;
    const to = from + pageSize - 1;
    const page = await fetchPage({ from, to, pageIndex, pageSize });

    if (!Array.isArray(page)) {
      throw new TypeError("MASSAGE_NATIVE_AVAILABILITY_PAGE_INVALID");
    }
    if (page.length > pageSize) {
      throw new RangeError("MASSAGE_NATIVE_AVAILABILITY_PAGE_TOO_LARGE");
    }

    rows.push(...page);

    if (page.length < pageSize) {
      return rows;
    }
  }

  throw new Error("MASSAGE_NATIVE_AVAILABILITY_PAGINATION_LIMIT");
}
