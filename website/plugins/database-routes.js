const fs = require('fs');
const path = require('path');

/**
 * A route per database entry, so every item has an address of its own: /database/10mm_SMG.
 *
 * The database is one React page that picks its entry out of the URL, and the site is static, so a
 * deep link only works if a page exists at that path. This registers one route per proto, all
 * rendering the same component — the page reads the slug back out of the location.
 *
 * The slugs come from static/data/protos.json, which the deploy workflow fetches from the database
 * release before building (scripts/database-release.sh). Without it there are no per-entry routes
 * and /database?id=<pid> still works, so a checkout with no database still builds.
 */
module.exports = function databaseRoutes(context) {
  return {
    name: 'database-routes',
    async contentLoaded({actions}) {
      const file = path.join(context.siteDir, 'static/data/protos.json');
      if (!fs.existsSync(file)) {
        console.warn('[database-routes] no static/data/protos.json — per-entry URLs are not built');
        return;
      }
      const {protos} = JSON.parse(fs.readFileSync(file, 'utf8'));
      const slugs = [...new Set(protos.map((proto) => proto.slug).filter(Boolean))];
      for (const slug of slugs) {
        actions.addRoute({
          path: `${context.baseUrl}database/${slug}`,
          component: '@site/src/pages/database.tsx',
          exact: true,
        });
      }
      console.log(`[database-routes] ${slugs.length} entry URLs`);
    },
  };
};
