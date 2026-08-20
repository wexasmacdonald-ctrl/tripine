import { describe, expect, it } from "vitest";
import { normalizeEmployeeEmailText } from "../src/connectors/microsoft/email/plain-text";

describe("employee email formatting", () => {
  it("removes model Markdown while preserving readable plain-text structure", () => {
    const result = normalizeEmployeeEmailText(`## Quote result

**Total:** $18,500 CAD
* Installation: not included
[Open quote](https://example.test/quote)`);

    expect(result).toBe(`Quote result

Total: $18,500 CAD
- Installation: not included
Open quote (https://example.test/quote)`);
  });
});
