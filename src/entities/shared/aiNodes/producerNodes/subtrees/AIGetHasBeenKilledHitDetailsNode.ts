import { AINodeOutput } from "src/api/ai";
import { EntityHitDetails } from "src/api/entity";
import { Sequence } from "src/engine/entity/AICoreNodes";

import { IsDead } from "../../consumerNodes/AIIsDeadNode";
import { GetHasBeenHitDetails } from "../AIGetHasBeenHitDetailsNode";

export const GetHasBeenKilledHitDetails = (
  outHitDetails: AINodeOutput<EntityHitDetails>
) => {
  const hitDetails = outHitDetails;

  // prettier-ignore
  return (
		Sequence(
			IsDead(),
			GetHasBeenHitDetails(hitDetails)
		)
	);
};
