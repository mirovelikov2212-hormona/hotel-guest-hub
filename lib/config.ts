import type { HotelConfig } from "@/lib/types";
import demo from "@/data/hotels/demo.json";

const registry: Record<string, HotelConfig> = {
  demo: demo as HotelConfig,
};

export async function getHotelConfig(hotelSlug: string) {
  return registry[hotelSlug] ?? null;
}
