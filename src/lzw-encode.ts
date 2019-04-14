/*
 * @Author: lijianzhang
 * @Date: 2018-09-15 19:40:17
 * @Last Modified by: lijianzhang
 * @Last Modified time: 2019-04-14 21:04:23
 */

import workPool from './work-pool';

export type Dictionary = Map<string | number, number>;

workPool.registerWork(
    'encode',
    (width: number, height: number, colorDepth: number, codes: Uint8Array) => {
        // tslint:disable-line
        class LzwEncoder {
            constructor(width: number, height: number, colorDepth: number) {
                this.defaultColorSize = Math.max(2, colorDepth);
                this.buffers = new Uint8Array(width * height + 100);
                this.init();
            }

            public defaultColorSize: number;

            public colorSize!: number;

            public dict: Dictionary = new Map<string, number>();
            public dict2: Dictionary = new Map<string, number>();

            public clearCode!: number;

            public endCode!: number;

            public buffers: Uint8Array;

            public remainingBits = 8;

            public index = 0;

            public codes: number[] = [];

            public init() {
                this.colorSize = this.defaultColorSize + 1;
                this.dict.clear();
                for (
                    let index = 0;
                    index < 2 ** this.defaultColorSize;
                    index += 1
                ) {
                    this.insertSeq(index);
                }
                this.clearCode = 1 << this.defaultColorSize;
                this.endCode = this.clearCode + 1;
                this.insertSeq(this.clearCode);
                this.insertSeq(this.endCode);
            }

            public insertSeq(str: string | number) {
                const index = this.dict.size;
                this.dict.set(str, index);
                this.dict2.set(str, index);
            }

            public getSeqCode(str: string | number) {
                return this.dict.get(str);
            }

            public encode(str: Uint8Array) {
                let prefixCode: string | number = '';

                let i = 0;
                this.pushCode(this.clearCode);
                while (i < str.length) {
                    if (this.dict.size === 4097) {
                        this.pushCode(this.clearCode);
                        this.init();
                    } else if (this.dict.size === (1 << this.colorSize) + 1) {
                        this.colorSize += 1;
                    }
                    const currentCode = str[i];
                    const key =
                        prefixCode !== ''
                            ? `${prefixCode},${currentCode}`
                            : currentCode;

                    if (
                        this.getSeqCode(key) !== undefined &&
                        str[i + 1] !== undefined
                    ) {
                        prefixCode = key;
                    } else {
                        this.insertSeq(key);
                        this.pushCode(this.getSeqCode(prefixCode));
                        prefixCode = currentCode;
                    }
                    i += 1;
                }
                this.pushCode(this.getSeqCode(prefixCode));
                this.pushCode(this.endCode);

                return this.buffers.slice(0, this.index + 1);
            }

            public pushCode(code: number) {
                this.codes.push(code);
                let colorSize = this.colorSize;
                let data = code;

                while (colorSize >= 0) {
                    const size = Math.min(colorSize, this.remainingBits);
                    const c =
                        this.buffers[this.index] |
                        ((data << (8 - this.remainingBits)) & 255);
                    this.buffers[this.index] = c;
                    data >>= size;
                    colorSize -= this.remainingBits;
                    this.remainingBits -= size;
                    if (this.remainingBits <= 0) {
                        this.index += 1;
                        this.remainingBits = (this.remainingBits % 8) + 8;
                    }
                }
            }
        }
        const encode = new LzwEncoder(width, height, colorDepth);

        return encode.encode(codes);
    },
);
