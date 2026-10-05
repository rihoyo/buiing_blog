// Bounded parallel work, preserving input order. Drain in-flight work before rejecting.
export async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0,
    failure;
  async function worker() {
    while (!failure && next < items.length) {
      const index = next++;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        failure = error || Error("ASYNC_WORK_FAILED");
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker),
  );
  if (failure) throw failure;
  return results;
}
