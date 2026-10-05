// Optimized endpoints are optional during rollout. Only missing-function errors fall back.
const missing = (error) =>
  error?.code === "PGRST202" || error?.code === "42883";
export function createAdminApi(rpc) {
  let separateLogs = true,
    separateStats = true;
  return {
    async activity(filters) {
      if (separateLogs)
        try {
          return await rpc("admin_community_activity", filters);
        } catch (error) {
          if (!missing(error)) throw error;
          separateLogs = false;
        }
      return (await rpc("admin_community_dashboard", filters)).activity || [];
    },
    async stats() {
      if (separateStats)
        try {
          return await rpc("admin_community_stats", {});
        } catch (error) {
          if (!missing(error)) throw error;
          separateStats = false;
        }
      return (await rpc("admin_community_dashboard", {})).stats;
    },
    series: (days) => rpc("admin_activity_series", { p_days: days }),
  };
}
