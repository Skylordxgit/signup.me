import { open, type CityResponse, type Reader } from "maxmind";

export interface MMDBLocationRecord {
  countryCode?: string;
  countryName?: string;
  regionCode?: string;
  regionName?: string;
  city?: string;
  timezone?: string;
}

export class MMDBReader {
  private constructor(private readonly reader: Reader<CityResponse>) {}

  static async open(filePath: string): Promise<MMDBReader> {
    const reader = await open<CityResponse>(filePath);
    if (!reader.metadata.databaseType.includes("City")) throw new Error("A GeoIP City database is required.");
    return new MMDBReader(reader);
  }

  lookup(ipAddress: string): MMDBLocationRecord | null {
    const data = this.reader.get(ipAddress);
    if (!data) return null;
    const region = data.subdivisions?.[0];
    return {
      countryCode: data.country?.iso_code,
      countryName: data.country?.names?.en,
      regionCode: region?.iso_code,
      regionName: region?.names?.en,
      city: data.city?.names?.en,
      timezone: data.location?.time_zone,
    };
  }
}
