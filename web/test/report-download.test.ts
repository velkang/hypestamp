import { afterEach, expect, it, vi } from "vitest";
import { downloadReport } from "../src/features/reports/ReportPage";
import { savedReport } from "./helpers/fixtures";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it("downloads exactly the saved report being displayed and releases the object URL",async()=>{
  const createObjectURL=vi.fn(()=>"blob:saved-report");const revokeObjectURL=vi.fn();
  vi.stubGlobal("URL",{createObjectURL,revokeObjectURL});
  const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
  downloadReport(savedReport);
  const blob=createObjectURL.mock.calls[0]?.[0] as Blob;
  const content=await new Promise<string>((resolve)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsText(blob);});
  expect(JSON.parse(content)).toEqual(savedReport);
  expect(blob.type).toBe("application/json");expect(click).toHaveBeenCalledOnce();
  await vi.waitFor(()=>expect(revokeObjectURL).toHaveBeenCalledWith("blob:saved-report"),{timeout:2000});
});
