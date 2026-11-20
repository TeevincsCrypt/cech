import { json, serverError } from "@/lib/server/http";
import { getDashboard } from "@/lib/server/read-models";

export async function GET() {
  try {
    return json(await getDashboard());
  } catch (err) {
    return serverError(err, "dashboard");
  }
}
