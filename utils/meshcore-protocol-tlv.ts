/**
 * MeshCore Protocol TLV - Format v1.13.0
 * Implémentation complète avec TLV (Tag-Length-Value)
 */

export class MeshCoreProtocolTLV {
  
  /**
   * Construit un packet avec header 4 bytes
   * Format: [opcode(1)] [0x00(1)] [length(2)] [payload...]
   */
  static buildPacket(opcode: number, payload: Uint8Array): Uint8Array {
    const header = new Uint8Array(4);
    header[0] = opcode;
    header[1] = 0x00;
    // Length en little-endian
    header[2] = payload.length & 0xFF;
    header[3] = (payload.length >> 8) & 0xFF;
    
    const packet = new Uint8Array(4 + payload.length);
    packet.set(header, 0);
    packet.set(payload, 4);
    return packet;
  }

  /**
   * Encode la configuration d'un canal (CMD_SET_CHANNEL = 0x20)
   * Format TLV complet pour v1.13
   */
  static encodeChannelConfig(name: string): Uint8Array {
    const tlv: Uint8Array[] = [];
    
    // Tag 0x01: channel_mode = default (0x00)
    tlv.push(new Uint8Array([0x01, 0x00]));
    
    // Tag 0x02: role = standard (0x02)
    tlv.push(new Uint8Array([0x02, 0x02]));
    
    // Tag 0x03: unused legacy
    tlv.push(new Uint8Array([0x03, 0x00]));
    
    // Tag 0x04: allowUnencrypted = true (0x01)
    tlv.push(new Uint8Array([0x04, 0x01]));
    
    // Tag 0x05: minAppVersion = 32 (0x20, 0x00)
    tlv.push(new Uint8Array([0x05, 0x20, 0x00]));
    
    // Tag 0x06: hopLimit = auto (0x00)
    tlv.push(new Uint8Array([0x06, 0x00]));
    
    // Tag 0x21: name (variable length)
    const nameBytes = new TextEncoder().encode(name.slice(0, 31));
    const nameTlv = new Uint8Array(2 + nameBytes.length);
    nameTlv[0] = 0x21;
    nameTlv[1] = nameBytes.length;
    nameTlv.set(nameBytes, 2);
    tlv.push(nameTlv);
    
    // Tag 0x30: PSK (16 bytes pour v1.13)
    // Pour canal public: 16 zeros
    const psk = new Uint8Array(16);
    const pskTlv = new Uint8Array(2 + psk.length);
    pskTlv[0] = 0x30;
    pskTlv[1] = psk.length;
    pskTlv.set(psk, 2);
    tlv.push(pskTlv);
    
    // Concaténer tous les TLV
    const totalLength = tlv.reduce((sum, t) => sum + t.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const t of tlv) {
      result.set(t, offset);
      offset += t.length;
    }
    return result;
  }

  /**
   * Encode un message de canal (CMD_SEND_CHAN_MSG = 0x03)
   * Format TLV complet pour v1.13
   */
  static encodeSendMessage(channelIndex: number, text: string): Uint8Array {
    const tlv: Uint8Array[] = [];
    
    // Tag 0x01: channelIndex (1 byte)
    tlv.push(new Uint8Array([0x01, 0x01, channelIndex & 0xFF]));
    
    // Tag 0x02: sender (4 bytes zeros pour anon)
    const sender = new Uint8Array(4);
    const senderTlv = new Uint8Array(2 + sender.length);
    senderTlv[0] = 0x02;
    senderTlv[1] = sender.length;
    senderTlv.set(sender, 2);
    tlv.push(senderTlv);
    
    // Tag 0x03: timestamp (4 bytes, little-endian)
    const ts = Math.floor(Date.now() / 1000);
    const tsBytes = new Uint8Array(4);
    tsBytes[0] = ts & 0xFF;
    tsBytes[1] = (ts >> 8) & 0xFF;
    tsBytes[2] = (ts >> 16) & 0xFF;
    tsBytes[3] = (ts >> 24) & 0xFF;
    const tsTlv = new Uint8Array(2 + tsBytes.length);
    tsTlv[0] = 0x03;
    tsTlv[1] = tsBytes.length;
    tsTlv.set(tsBytes, 2);
    tlv.push(tsTlv);
    
    // Tag 0x04: message text
    const textBytes = new TextEncoder().encode(text);
    const textTlv = new Uint8Array(2 + textBytes.length);
    textTlv[0] = 0x04;
    textTlv[1] = textBytes.length;
    textTlv.set(textBytes, 2);
    tlv.push(textTlv);
    
    // Concaténer
    const totalLength = tlv.reduce((sum, t) => sum + t.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const t of tlv) {
      result.set(t, offset);
      offset += t.length;
    }
    return result;
  }

  /**
   * Parse la réponse GET_CHANNELS (format TLV 49 bytes)
   */
  static parseGetChannelsResponse(buf: Uint8Array): Record<number, Uint8Array> {
    const out: Record<number, Uint8Array> = {};
    let i = 0;
    
    while (i < buf.length) {
      if (i + 2 > buf.length) break;
      
      const tag = buf[i];
      const len = buf[i + 1];
      
      if (i + 2 + len > buf.length) break;
      
      const value = buf.slice(i + 2, i + 2 + len);
      out[tag] = value;
      i += 2 + len;
    }
    
    return out;
  }

  /**
   * Décode le nom d'un canal à partir du TLV parsé
   */
  static extractChannelName(parsed: Record<number, Uint8Array>): string {
    // Tag 0x21 = name
    const nameBytes = parsed[0x21];
    if (nameBytes) {
      return new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim();
    }
    return '';
  }

  /**
   * Décode le PSK d'un canal à partir du TLV parsé
   */
  static extractChannelPsk(parsed: Record<number, Uint8Array>): Uint8Array {
    // Tag 0x30 = PSK
    return parsed[0x30] || new Uint8Array(16);
  }
}

// Command codes
export const CMD_SET_CHANNEL_TLV = 0x20;
export const CMD_SEND_CHAN_MSG_TLV = 0x03;
