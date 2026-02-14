import type { HotelConfig } from "./types";
import demo from "@/data/hotels/demo.json";

const HOTEL_MAP: Record<string, HotelConfig> = {
  demo: demo as HotelConfig,
};

export async function getHotelConfig(hotelSlug: string): Promise<HotelConfig | null> {
  return HOTEL_MAP[hotelSlug] ?? null;
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/h/demo",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
