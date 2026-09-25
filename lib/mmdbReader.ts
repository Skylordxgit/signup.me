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
  private readonly reader: Reader<CityResponse>;

  private constructor(reader: Reader<CityResponse>) {
    this.reader = reader;
  }

  static async open(filePath: string): Promise<MMDBReader> {
    const reader = await open<CityResponse>(filePath);
    if (!reader.metadata.databaseType.includes("City")) throw new Error("A GeoIP City database is required.");
    return new MMDBReader(reader);
  }

  get databaseType(): string {
    return this.reader.metadata.databaseType || "GeoLite2-City";
  }

  get buildEpoch(): Date | number | undefined {
    return this.reader.metadata.buildEpoch;
  }

  get ipVersion(): number | undefined {
    return this.reader.metadata.ipVersion;
  }

  rawLookup(ipAddress: string): CityResponse | null {
    try {
      return this.reader.get(ipAddress);
    } catch {
      return null;
    }
  }

  static formatRecord(data: CityResponse | null | undefined): MMDBLocationRecord | null {
    if (!data) return null;
    const region = data.subdivisions?.[0];
    const countryCode = data.country?.iso_code || data.registered_country?.iso_code;
    const countryName = data.country?.names?.en || data.registered_country?.names?.en;
    const regionCode = region?.iso_code;
    const regionName = region?.names?.en;
    const city = data.city?.names?.en;
    const timezone = data.location?.time_zone;

    if (!countryCode && !countryName && !regionName && !city) {
      return null;
    }

    return {
      countryCode,
      countryName,
      regionCode,
      regionName,
      city,
      timezone,
    };
  }

  lookup(ipAddress: string): MMDBLocationRecord | null {
    return MMDBReader.formatRecord(this.rawLookup(ipAddress));
  }
}
