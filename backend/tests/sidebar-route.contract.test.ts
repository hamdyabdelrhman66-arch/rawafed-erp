import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(process.cwd(), "..");
const read = (path: string) => readFileSync(resolve(workspace, path), "utf8");

describe("sidebar route contract", () => {
  it("maps every static sidebar destination to a top-level or finance route", () => {
    const sidebar = read("src/app/app.component.html");
    const appRoutes = read("src/app/app.routes.ts");
    const financeRoutes = read("src/app/pages/finance/finance.routes.ts");
    const links = [...sidebar.matchAll(/routerLink="([^"]+)"/g)].map((match) => match[1]);

    expect(links.length).toBeGreaterThan(10);
    for (const link of new Set(links)) {
      const segments = link.replace(/^\//, "").split("/");
      if (segments[0] === "finance" && segments[1]) {
        expect(financeRoutes, `Missing finance route for ${link}`).toContain(`path: '${segments[1]}'`);
      } else {
        expect(appRoutes, `Missing application route for ${link}`).toContain(`path: '${segments[0]}'`);
      }
    }
  });

  it("keeps finance deep links behind the authenticated parent route", () => {
    const appRoutes = read("src/app/app.routes.ts");
    expect(appRoutes).toMatch(/path:\s*'finance'[\s\S]*?canActivate:\s*\[authGuard\][\s\S]*?loadChildren:/);
  });
});
