import { promises as fs, existsSync } from "node:fs";
import { isIP } from "node:net";

export interface MMDBLocationRecord {
  countryCode?: string;
  countryName?: string;
  regionCode?: string;
  regionName?: string;
  city?: string;
  timezone?: string;
}

/**
 * Lightweight, robust, pure TypeScript MaxMind MMDB (GeoLite2-City / GeoLite2-Country) binary reader.
 * Zero external dependencies. Safely parses standard .mmdb database files.
 */
export class MMDBReader {
  private buffer: Buffer;
  private nodeCount: number = 0;
  private recordSize: number = 0;
  private ipVersion: number = 6;
  private nodeOffsetMultiplier: number = 0;
  private dataSectionStart: number = 0;
  private metadata: Record<string, unknown> = {};

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.init();
  }

  static async open(filePath: string): Promise<MMDBReader | null> {
    try {
      if (!existsSync(filePath)) return null;
      const buffer = await fs.readFile(filePath);
      return new MMDBReader(buffer);
    } catch {
      return null;
    }
  }

  getMetadata(): Record<string, unknown> {
    return { ...this.metadata };
  }

  private init() {
    const marker = Buffer.from("\xAB\xCD\xEFMaxMind.com");
    const markerPos = this.buffer.lastIndexOf(marker);
    if (markerPos === -1) {
      throw new Error("Invalid MMDB database: metadata marker not found");
    }

    const metadataStart = markerPos + marker.length;
    const metadataDecoder = new DataDecoder(this.buffer, metadataStart);
    this.metadata = metadataDecoder.decode().value as Record<string, unknown>;

    this.nodeCount = Number(this.metadata.node_count) || 0;
    this.recordSize = Number(this.metadata.record_size) || 28;
    this.ipVersion = Number(this.metadata.ip_version) || 6;
    this.nodeOffsetMultiplier = (this.recordSize * 2) / 8;
    this.dataSectionStart = this.nodeCount * this.nodeOffsetMultiplier + 16;
  }

  lookup(ipAddress: string): MMDBLocationRecord | null {
    if (!isIP(ipAddress)) return null;
    const isV4 = ipAddress.includes(".");
    const ipBytes = parseIpBytes(ipAddress);
    if (!ipBytes) return null;

    let nodeNumber = 0;
    // For IPv4 in an IPv6 tree, navigate 96 zero bits first
    const bitCount = isV4 && this.ipVersion === 6 ? 128 : ipBytes.length * 8;
    const startBit = isV4 && this.ipVersion === 6 ? 96 : 0;

    for (let bitIndex = 0; bitIndex < bitCount; bitIndex++) {
      if (nodeNumber >= this.nodeCount) break;

      let bit = 0;
      if (bitIndex < startBit) {
        bit = 0;
      } else {
        const actualBitIndex = bitIndex - startBit;
        const byteIndex = Math.floor(actualBitIndex / 8);
        const bitOffset = 7 - (actualBitIndex % 8);
        bit = (ipBytes[byteIndex] >> bitOffset) & 1;
      }

      nodeNumber = this.readNode(nodeNumber, bit);
    }

    if (nodeNumber < this.nodeCount) {
      return null; // Search completed without finding record
    }

    const dataOffset = nodeNumber - this.nodeCount - 16;
    if (dataOffset < 0) return null;

    try {
      const decoder = new DataDecoder(this.buffer, this.dataSectionStart + dataOffset);
      const data = decoder.decode().value as Record<string, any>;
      return formatMMDBRecord(data);
    } catch {
      return null;
    }
  }

  private readNode(nodeIndex: number, bit: number): number {
    const nodeOffset = nodeIndex * this.nodeOffsetMultiplier;
    if (nodeOffset >= this.buffer.length) return 0;

    if (this.recordSize === 24) {
      if (bit === 0) {
        return (
          (this.buffer[nodeOffset] << 16) |
          (this.buffer[nodeOffset + 1] << 8) |
          this.buffer[nodeOffset + 2]
        );
      } else {
        return (
          (this.buffer[nodeOffset + 3] << 16) |
          (this.buffer[nodeOffset + 4] << 8) |
          this.buffer[nodeOffset + 5]
        );
      }
    } else if (this.recordSize === 28) {
      const middle = this.buffer[nodeOffset + 3];
      if (bit === 0) {
        return (
          ((middle & 0xf0) << 20) |
          (this.buffer[nodeOffset] << 16) |
          (this.buffer[nodeOffset + 1] << 8) |
          this.buffer[nodeOffset + 2]
        );
      } else {
        return (
          ((middle & 0x0f) << 24) |
          (this.buffer[nodeOffset + 4] << 16) |
          (this.buffer[nodeOffset + 5] << 8) |
          this.buffer[nodeOffset + 6]
        );
      }
    } else if (this.recordSize === 32) {
      if (bit === 0) {
        return this.buffer.readUInt32BE(nodeOffset);
      } else {
        return this.buffer.readUInt32BE(nodeOffset + 4);
      }
    }
    return 0;
  }
}

function parseIpBytes(ip: string): number[] | null {
  if (ip.includes(":")) {
    // IPv6
    try {
      const parts = ip.split("::");
      const left = parts[0] ? parts[0].split(":") : [];
      const right = parts.length > 1 && parts[1] ? parts[1].split(":") : [];
      const fillCount = 8 - (left.length + right.length);
      const fullParts: string[] = [...left, ...Array(Math.max(0, fillCount)).fill("0"), ...right];
      const bytes: number[] = [];
      for (const p of fullParts) {
        const val = parseInt(p || "0", 16);
        bytes.push((val >> 8) & 0xff, val & 0xff);
      }
      return bytes.length === 16 ? bytes : null;
    } catch {
      return null;
    }
  } else {
    // IPv4
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
    return parts;
  }
}

function formatMMDBRecord(data: any): MMDBLocationRecord {
  if (!data || typeof data !== "object") return {};
  const countryCode = data.country?.iso_code || data.registered_country?.iso_code || "";
  const countryName = data.country?.names?.en || data.registered_country?.names?.en || "";
  const sub = Array.isArray(data.subdivisions) && data.subdivisions[0] ? data.subdivisions[0] : {};
  const regionCode = sub.iso_code || "";
  const regionName = sub.names?.en || "";
  const city = data.city?.names?.en || "";
  const timezone = data.location?.time_zone || "";

  return {
    countryCode,
    countryName,
    regionCode,
    regionName,
    city,
    timezone,
  };
}

class DataDecoder {
  private buffer: Buffer;
  public offset: number;

  constructor(buffer: Buffer, offset: number) {
    this.buffer = buffer;
    this.offset = offset;
  }

  decode(): { value: any; offset: number } {
    if (this.offset >= this.buffer.length) return { value: null, offset: this.offset };

    const ctrlByte = this.buffer[this.offset++];
    let type = ctrlByte >> 5;
    let size = ctrlByte & 0x1f;

    if (type === 0) {
      type = this.buffer[this.offset++] + 7;
    }

    if (type === 1) {
      // Pointer
      const pointerSize = ((ctrlByte >> 3) & 0x03) + 1;
      let pointerVal = 0;
      if (pointerSize === 1) {
        pointerVal = ((ctrlByte & 0x07) << 8) | this.buffer[this.offset++];
      } else if (pointerSize === 2) {
        pointerVal = 2048 + (((ctrlByte & 0x07) << 16) | (this.buffer[this.offset++] << 8) | this.buffer[this.offset++]);
      } else if (pointerSize === 3) {
        pointerVal =
          526336 +
          (((ctrlByte & 0x07) << 24) |
            (this.buffer[this.offset++] << 16) |
            (this.buffer[this.offset++] << 8) |
            this.buffer[this.offset++]);
      } else if (pointerSize === 4) {
        pointerVal = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
      }
      const currentOffset = this.offset;
      this.offset = pointerVal;
      const target = this.decode();
      this.offset = currentOffset;
      return { value: target.value, offset: this.offset };
    }

    if (size >= 29) {
      const bytesToRead = size - 28;
      let extra = 0;
      for (let i = 0; i < bytesToRead; i++) {
        extra = (extra << 8) | this.buffer[this.offset++];
      }
      if (size === 29) size = 29 + extra;
      else if (size === 30) size = 285 + extra;
      else if (size === 31) size = 65821 + extra;
    }

    switch (type) {
      case 2: {
        // UTF-8 string
        const str = this.buffer.toString("utf8", this.offset, this.offset + size);
        this.offset += size;
        return { value: str, offset: this.offset };
      }
      case 3: {
        // Double
        const val = this.buffer.readDoubleBE(this.offset);
        this.offset += 8;
        return { value: val, offset: this.offset };
      }
      case 4: {
        // Byte array
        const bytes = this.buffer.subarray(this.offset, this.offset + size);
        this.offset += size;
        return { value: bytes, offset: this.offset };
      }
      case 5: {
        // uint16
        let val = 0;
        for (let i = 0; i < size; i++) val = (val << 8) | this.buffer[this.offset++];
        return { value: val, offset: this.offset };
      }
      case 6: {
        // uint32
        let val = 0;
        for (let i = 0; i < size; i++) val = (val << 8) | this.buffer[this.offset++];
        return { value: val, offset: this.offset };
      }
      case 7: {
        // Map
        const map: Record<string, any> = {};
        for (let i = 0; i < size; i++) {
          const key = this.decode().value;
          const val = this.decode().value;
          if (typeof key === "string") map[key] = val;
        }
        return { value: map, offset: this.offset };
      }
      case 8: {
        // int32
        let val = 0;
        for (let i = 0; i < size; i++) val = (val << 8) | this.buffer[this.offset++];
        return { value: val, offset: this.offset };
      }
      case 9: {
        // uint64
        let val = BigInt(0);
        for (let i = 0; i < size; i++) val = (val << BigInt(8)) | BigInt(this.buffer[this.offset++]);
        return { value: Number(val), offset: this.offset };
      }
      case 10: {
        // uint128
        this.offset += size;
        return { value: null, offset: this.offset };
      }
      case 11: {
        // Array
        const arr: any[] = [];
        for (let i = 0; i < size; i++) {
          arr.push(this.decode().value);
        }
        return { value: arr, offset: this.offset };
      }
      case 14: {
        // Boolean
        return { value: size !== 0, offset: this.offset };
      }
      case 15: {
        // Float
        const val = this.buffer.readFloatBE(this.offset);
        this.offset += 4;
        return { value: val, offset: this.offset };
      }
      default:
        this.offset += size;
        return { value: null, offset: this.offset };
    }
  }
}
