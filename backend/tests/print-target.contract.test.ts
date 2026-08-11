import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(process.cwd(), "..");
const read = (path: string) => readFileSync(resolve(workspace, path), "utf8");

describe("print target isolation", () => {
  it("prints the generated invoice PDF instead of the application page", () => {
    const css = read("src/app/pages/finance/invoice-detail-view/invoice-detail-view.css");
    const component = read("src/app/pages/finance/invoice-detail-view/invoice-detail-view.ts");
    expect(css).toMatch(/@page\s*{[\s\S]*?size:\s*A4 portrait/);
    expect(css).toMatch(/@media print[\s\S]*?:host[\s\S]*?position:\s*fixed/);
    expect(css).toMatch(/\.invoice-document[\s\S]*?width:\s*210mm/);
    expect(component).toContain("await this.invoicePdf.print(this.pdfDocument(this.detail))");
    expect(component).not.toContain("window.print()");
  });

  it("opens the selected receipt and prints only its A4 receipt component", () => {
    const list = read("src/app/pages/finance/payments/payments.ts");
    const details = read("src/app/pages/finance/payment-details/payment-details.ts");
    const css = read("src/app/pages/finance/payment-details/payment-details.css");
    expect(list).toContain("/finance/payment-details/${encodeURIComponent(String(payment.id))}?print=1");
    expect(details).toContain("queryParamMap.get('print') === '1'");
    expect(css).toMatch(/@media print[\s\S]*?\.payment-receipt[\s\S]*?width:\s*182mm/);
  });
});
