import { z } from "zod";

export const zodUndefinedModel = z.undefined().describe("undefined");

// mutations without input: express.json() in the API turns an empty body into {}
export const zodNoInputMutationModel = z.object({}).strict().optional().describe("no input");

export { z };
