import Frame from './frame';
import NeuQuant from './neuquant.js';
import LzwEncoder from './lzw-encode';

const NETSCAPE2_0 = 'NETSCAPE2.0'.split('').map(s => s.charCodeAt(0));

export default class GIFEncoder {
    private frames: Frame[] = [];

    public codes: number[] = [];

    addFrame(frame: Frame) {
        const preFrame = this.frames[this.frames.length - 1];
        frame.prevFrame = preFrame;
        this.frames.push(frame);
    }

    addFrames(frames: Frame[]) {
        frames.forEach(frame => this.addFrame(frame));
    }

    generate(samplefac?: number, colorDepth?: number) {
        this.writeFlag();
        this.generatePalette(samplefac, colorDepth);
        this.writeLogicalScreenDescriptor();
        this.writeApplicationExtension();
        this.wirteFrames();
        this.addCode(0x3b);
    }

    private strTocode(str: string) {
        return str.split('').map(s => s.charCodeAt(0));
    }

    private numberToBytes(num: number) {
        return [num & 255, num >> 8];
    }

    addCodes(codes: number[]) {
        this.codes.push(...codes);
    }
    addCode(code: number) {
        this.codes.push(code);
    }

    writeFlag() {
        if (this.frames.length < 1) throw new Error('缺少图片');
        this.addCodes(this.strTocode('GIF89a'));
    }

    neuQuant?: NeuQuant;

    /**
     * 调色板
     */
    palette: number[] = [];

    /**
     * 颜色深度
     */
    colorDepth: number = 8;

    transparencIndex?: number;

    colorMap: Map<string, number> = new Map();

    /**
     * 生成全局的调色板
     *
     * @param {number} [samplefac=10]
     * @param {number} [colorDepth=8]
     * @memberof GIFEncoder
     */
    generatePalette(samplefac: number = 10, colorDepth: number = 8) {
        console.time('generateFrameImageDatas');
        this.generateFrameImageDatas(this.frames);
        console.timeEnd('generateFrameImageDatas');

        console.time('parseFramePixels');
        this.frames.forEach(f => this.parseFramePixels(f));
        console.timeEnd('parseFramePixels');

        if (this.palette.length) {
            const maxColorDepth = Math.ceil(Math.log2(this.palette.length / 3));
            this.colorDepth = Math.min(colorDepth, maxColorDepth);
        } else {
            this.colorDepth = 0;
        }
        // console.time('generateFrameImageDatas');
        // this.generateFrameImageDatas(this.frames);
        // console.timeEnd('generateFrameImageDatas');

        // console.time('getTotalPixels');
        // const pixels = this.getTotalPixels(this.frames);
        // console.timeEnd('getTotalPixels');

        // const maxColorDepth = Math.ceil(Math.log2(pixels.length / 3));

        // this.colorDepth = Math.min(colorDepth, maxColorDepth);

        // if (pixels.length / 3 > 255) {
        //     this.neuQuant = new NeuQuant(pixels, { netsize: (1 << this.colorDepth) - 1, samplefac }); // 减1保留透明色位置
        //     this.neuQuant.buildColorMap();
        //     this.palette = Array.from(this.neuQuant.getColorMap());
        // } else {
        //     this.palette = pixels;
        //     if (this.transparencIndex !== undefined && this.palette.length / 3 === 1 << this.colorDepth) {
        //         this.colorDepth += 1;
        //     }
        // }
        // if (this.transparencIndex !== undefined) {
        //     const index = this.palette!.length;
        //     this.transparencIndex = index / 3;
        //     this.palette!.push(0, 0, 0);
        // }

        // while (this.palette!.length < (1 << this.colorDepth) * 3) {
        //     this.palette!.push(0, 0, 0);
        // }
    }

    hasTransparenc = false;

    // 局部颜色板索引map
    localColorMap: Map<Frame, Map<string, number>> = new Map();

    /**
     * 解析帧的图像
     *
     * @memberof GIFEncoder
     */
    parseFramePixels(frame: Frame) {
        const colorMap = new Map(this.colorMap);
        const localColorMap = new Map();
        let rgbPixels: number[] = [];
        let globalRgbPixels: number[] = [];
        let hasTransparenc = false;

        for (let index = 0; index < frame.pixels.length; index += 4) {
            const r = frame.pixels[index];
            const g = frame.pixels[index + 1];
            const b = frame.pixels[index + 2];
            const a = frame.pixels[index + 3];
            
            if (a === 0 && !hasTransparenc) {
                hasTransparenc = true;
            } else {
                const c = `${r},${g},${b}`;
                if (!localColorMap.has(c)) { // XXX: 待优化
                    const size = localColorMap.size;
                    localColorMap.set(c, size);
                    rgbPixels.push(r,g,b);
                    if (!colorMap.has(c)) {
                        const size = colorMap.size;
                        colorMap.set(c, size);
                        globalRgbPixels.push(r,g,b);
                    }
                }
            }
        }

        // 图像颜色数目超过256个需要减图片质量
        if ((localColorMap.size + (hasTransparenc ? 1: 0)) > 256) { 
            const nq = new NeuQuant(rgbPixels, { netsize: hasTransparenc ? 255 : 256, samplefac: 1 });
            nq.buildColorMap();
            rgbPixels = nq.getColorMap();
            if (hasTransparenc) {
                rgbPixels.push(0, 0, 0);
                frame.transparentColorIndex = 255;
            }
            frame.isGlobalPalette = false;
            frame.palette = rgbPixels;
        } else if ((colorMap.size  + (this.hasTransparenc ? 1: 0)) > 256) { //全局颜色板不够放,放到局部
            frame.isGlobalPalette = false;
            this.localColorMap.set(frame, localColorMap);
            frame.palette = rgbPixels;
            if (hasTransparenc) {
                frame.transparentColorIndex = rgbPixels.length;
                rgbPixels.push(0, 0, 0);
            }
        } else {
            this.colorMap = colorMap;
            if (!frame.prevFrame) {
                this.palette = rgbPixels;
            } else {
                this.palette.push(...globalRgbPixels);
            }
            if (hasTransparenc && this.transparencIndex === undefined) {
                this.transparencIndex = this.palette.length;
                this.palette.push(0, 0, 0);
            }
            frame.transparentColorIndex = this.transparencIndex;
            frame.isGlobalPalette = true;
            frame.palette = this.palette;
        }
    }

    getTotalPixels(frames: Frame[]) {
        let i = 0;
        return frames.reduce((pixels, frame) => {
            for (let index = 0; index < frame.imgData.length; index += 4) {
                const r = frame.imgData[index];
                const g = frame.imgData[index + 1];
                const b = frame.imgData[index + 2];
                const a = frame.imgData[index + 3];

                
                if (a === 0) { //获取透明颜色索引
                    this.transparencIndex = i;
                } else {
                    const c = `${r},${g},${b}`;
                    if (!this.colorMap.has(c)) {
                        pixels.push(r,g,b);
                        this.colorMap.set(c, i);
                        i += 1;
                    }
                }
            }
            return pixels;
        }, [] as number[]);
    }

    // TODO: 1.太耗时, 2可能会出现误差
    generateFrameImageDatas(frames: Frame[]) {
        const [firstFrame, ...otherFrams] = frames;
        let lastImageData = [...firstFrame.pixels];
        firstFrame.imgData = firstFrame.pixels; 

        otherFrams.forEach((frame, i) => {
            console.time(`generateFrameImageDatas frame ${i}`);
            let imgData: number[] = [];
            const { x, y, w } = frame;
            let alphaList: number[] = [];
            for (let index = 0; index < frame.pixels.length; index += 4) {
                const offset = ((Math.floor((index / 4) / w) + y) * frame.width + x + (index / 4 % w)) * 4;
                const r1 = frame.pixels[index];
                const r2 = lastImageData[offset];
                const g1 = frame.pixels[index + 1];
                const g2 = lastImageData[offset + 1];
                const b1 = frame.pixels[index + 2];
                const b2 = lastImageData[offset + 2];
                const a = frame.pixels[index + 3];
                if (r1 === r2 && g1 === g2 && b1 === b2) {
                    imgData.push(0, 0, 0, 0);
                    alphaList.push(0);
                }  else {
                    imgData.push(r1, g1, b1, a);
                    lastImageData[offset] = r1;
                    lastImageData[offset + 1] = g1;
                    lastImageData[offset + 2] = b1;
                    lastImageData[offset + 3] = a;
                    alphaList.push(a);
                }
            }

            let top = Math.floor(alphaList.findIndex(v => v !== 0) / frame.w);
            if (top) {
                imgData.splice(0, top * frame.w * 4);
                alphaList.splice(0, top * frame.w);
                frame.y = top;
                frame.h -= top;
            }

            alphaList.reverse();
            let bottom = Math.floor(alphaList.findIndex(v => v !== 0) / frame.w);
            if (bottom) {
                alphaList.splice(-bottom * frame.w);
                imgData.splice(-bottom * frame.w * 4);
                frame.h -= bottom;
            }
            let left = 0;
            while (true) {
                const arr =alphaList.filter((v, i) => v === 0 && ((i + 1) % frame.w) === 1 + left);
                if (arr.length === frame.h) {
                    left += 1;
                } else {
                    break;
                }
            }

            let right = 0;

            while (true) {
                const arr = alphaList.filter((v, i) => v === 0 && ((i + 1) % frame.w) === frame.w - right);
                if (arr.length === frame.h) {
                    right += 1;
                } else {
                    break;
                }
            }
            imgData = imgData.filter((_, i) => {
                const range = (Math.floor(i / 4) % frame.w);
                if ((range < left || range >= (frame.w - right))) {
                    return false;
                }
                return true;
            })
            frame.x += left;
            frame.w -= (left + right);
            frame.pixels = imgData;
            if (frame.pixels.length === 0) debugger;
            console.timeEnd(`generateFrameImageDatas frame ${i}`);
        });
    }

    /**
     * TODO: 计算颜色等, 待完成 暂时写死
     *
     * @private
     * @memberof GIFEncoder
     */
    private writeLogicalScreenDescriptor() {
        const { w, h } = this.frames[0];
        this.addCodes(this.numberToBytes(w));
        this.addCodes(this.numberToBytes(h));

        while (this.palette!.length < (1 << this.colorDepth) * 3) {
            this.palette!.push(0, 0, 0);
        }

        let m = (this.palette.length ? 1 : 0) << 7; // globalColorTableFlag
        m += 0 << 4; // colorResolution
        m += 0 << 3; // sortFlag
        m += this.palette.length ? this.colorDepth - 1 : 0; // sizeOfGlobalColorTable
        this.addCode(m);
        this.addCode(0); // backgroundColorIndex
        this.addCode(255); // pixelAspectRatio
        if (this.palette.length) {
            this.addCodes(this.palette);
        }
    }

    findClosest(r: number, g: number, b: number, frame: Frame) {
        const colorMap = this.localColorMap.get(frame);
        const c = `${r},${g},${b}`;
        if (colorMap) {
            return colorMap.get(c)!;
        } else if (!frame.isGlobalPalette) {
            let minpos = 0;
            let mind = 256 * 256 * 256;

            for (let i = 0; i < frame.palette.length; i += 3) {
                const dr = r - frame.palette[i];
                const dg = g - frame.palette[i + 1];
                const db = b - frame.palette[i + 2];
                const d = dr * dr + dg * dg + db * db;
                const pos = (i / 3) | 0;

                if (d < mind) {
                    mind = d;
                    minpos = pos;
                }

                i++;
            }
            return minpos;
        }
        return this.colorMap.get(c)!;
    }

    wirteFrames() {
        this.frames.forEach((frame) => {
            // 1. Graphics Control Extension
            this.addCode(0x21); // exc flag
            this.addCode(0xf9); // al
            this.addCode(4); // byte size
            let m = 0;
            m += 1 << 2; // sortFlag
            m += +frame.useInput << 1;
            m += frame.transparentColorIndex !== undefined ? 1 : 0;
            this.addCode(m);
            this.addCodes(this.numberToBytes(Math.floor(frame.delay / 10)));
            this.addCode(frame.transparentColorIndex || 0);
            this.addCode(0);

            // 2. image Descriptor
            this.addCode(0x2c);

            this.addCodes(this.numberToBytes(frame.x));
            this.addCodes(this.numberToBytes(frame.y));
            this.addCodes(this.numberToBytes(frame.w));
            this.addCodes(this.numberToBytes(frame.h));
            m = 0;

            let colorDepth = this.colorDepth;
            if (!frame.isGlobalPalette) {
                const sizeOfColorTable = Math.ceil(Math.log2(frame.palette.length / 3)) - 1;
                colorDepth = sizeOfColorTable + 1;
                while (frame.palette!.length < (1 << colorDepth) * 3) {
                    frame.palette!.push(0, 0, 0);
                }
                m = (1 << 7) | sizeOfColorTable;
            }
            this.addCode(m);
            if (!frame.isGlobalPalette) {
                this.addCodes(frame.palette);
            }
            // Image Data
            this.addCode(colorDepth);

            
            const indexs: number[] = [];
            const imageData = frame.pixels;

            for (let i = 0; i < imageData.length; i += 4) {
                if (imageData[i + 3] === 0) {
                    indexs.push(frame.transparentColorIndex!);
                } else {
                    const r = imageData[i];
                    const g = imageData[i + 1];
                    const b = imageData[i + 2];
                    indexs.push(this.findClosest(r, g, b, frame));
                }
            }
            const encoder = new LzwEncoder(frame.w, frame.h, colorDepth);
            const codes = Array.from(encoder.encode(indexs));
            let len = codes.length;
            while (len > 0) {
                this.addCode(Math.min(len, 0xFF));
                this.addCodes(codes.splice(0, 0xFF));
                len -= 255;
            }
            this.addCode(0);
        });
    }

    private writeApplicationExtension() {
        this.addCode(0x21);        
        this.addCode(255);
        this.addCode(11);
        this.addCodes(NETSCAPE2_0);
        this.addCode(3);
        this.addCode(1);
        this.addCode(0);
        this.addCode(0);
        this.addCode(0);
    }

    toBlob() {
        const array = new ArrayBuffer(this.codes.length);
        const view = new DataView(array);
        this.codes.forEach((v, i) => view.setUint8(i, v));
        return new Blob([view], {type: "image/png"});
    }
}