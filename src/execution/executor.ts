import type {
  ExecutionPlan,
  GenerateOperation,
  RecordStateOperation,
  VerifyOperation,
  WriteConfigOperation
} from "../core/planning/execution-plan.js";

export interface ExecutionHandlers {
  readonly generate: (operation: GenerateOperation) => Promise<void>;
  readonly writeConfig: (operation: WriteConfigOperation) => Promise<void>;
  readonly verify: (operation: VerifyOperation) => Promise<void>;
  readonly recordState: (operation: RecordStateOperation) => Promise<void>;
}

export const executePlan = async (plan: ExecutionPlan, handlers: ExecutionHandlers): Promise<void> => {
  for (const operation of plan.operations) {
    switch (operation.type) {
      case "generate":
        await handlers.generate(operation);
        break;
      case "write-config":
        await handlers.writeConfig(operation);
        break;
      case "verify":
        await handlers.verify(operation);
        break;
      case "record-state":
        await handlers.recordState(operation);
        break;
    }
  }
};
