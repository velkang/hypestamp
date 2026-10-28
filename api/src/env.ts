import { isAddress } from "viem";
import { z } from "zod";

const envSchema = z.object({
  TWITTERAPI_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  BRIDGE_URL: z.url(),
  BRIDGE_TOKEN: z.string().min(1),
  SEPOLIA_RPC_URL: z.url(),
  LEDGER_ADDRESS: z.string().refine((value) => isAddress(value), "must be an address"),
  LEDGER_START_BLOCK: z.string().regex(/^\d+$/).transform((value) => BigInt(value)),
});

export type AgentEnv = z.infer<typeof envSchema>;

const ledgerSchema = envSchema.pick({ SEPOLIA_RPC_URL: true, LEDGER_ADDRESS: true, LEDGER_START_BLOCK: true });
const cycleSchema = envSchema.pick({ TWITTERAPI_KEY: true, OPENAI_API_KEY: true, BRIDGE_URL: true, BRIDGE_TOKEN: true });

export const parseLedgerEnv = (env: Record<string, unknown>) => parse(ledgerSchema, env);
export const parseCycleEnv = (env: Record<string, unknown>) => parse(cycleSchema, env);

// Fails fast with the names of bad variables only; values are secrets.
export function parseEnv(env: Record<string, unknown>): AgentEnv {
  return parse(envSchema, env);
}

function parse<T>(schema: z.ZodType<T>, env: Record<string, unknown>): T {
  const result = schema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid or missing environment variables: ${names.join(", ")}`);
  }
  return result.data;
}
