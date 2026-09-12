import "server-only";

import { runHotelIntakePipelineV2Safe } from "@/lib/server/hotel-scanner-v2-pipeline-safe";

export type HotelIntakePipelineV2Result = Awaited<ReturnType<typeof runHotelIntakePipelineV2Safe>>;

export const runHotelIntakePipelineV2 = runHotelIntakePipelineV2Safe;
