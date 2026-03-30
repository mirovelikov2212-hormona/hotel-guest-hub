import { getHotelByAnySlug } from "@/lib/hotels/getHotelByAnySlug";

export async function getHotelIdBySlug(inputSlug?: string): Promise<string> {
  const hotel = await getHotelByAnySlug(inputSlug);
  return hotel.id;
}