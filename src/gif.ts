/*
 * @Author: lijianzhang
 * @Date: 2018-09-15 21:52:17
 * @Last Modified by: lijianzhang
 * @Last Modified time: 2018-09-16 20:40:54
 */
import Frame, { IFrameOpiton } from './frame';
import LzwDecode from './lzw-decode';

const CONSTANT_FALG = {
    imageDescriptor: 0x2C,
    extension: 0x21,
    imageExtension: 0xF9,
    plainTextExtension: 0x01,
    applicationExtension: 0xFF,
    commentExtension: 0xFE,
    endFlag: 0x3B,
};

export default class Gif {
    constructor(data: Blob) {
        this.fieldReader = new FileReader();
        this.fieldReader.readAsArrayBuffer(data);
        this.fieldReader.onload = this.onLoad.bind(this);
        (window as any).gif = this;
    }

    private fieldReader: FileReader;

    private dataSource!: Uint8Array;

    currentOptions?: IFrameOpiton;

    private onLoad() {
        console.time('total');
        this.dataSource = new Uint8Array(this.fieldReader.result as ArrayBuffer);
        this.readHeader();
        this.readLogicalScreenDescriptor();

        if (this.globalColorTableFlag) {
            const len =  2 ** (this.sizeOfGlobalColorTable + 1) * 3;
            this.colors = this.readColorTable(len);
        }

        while (!this.loaded) {
            this.readExtension();
        }
        console.timeEnd('total');

        let lastCanvas: CanvasRenderingContext2D;
        this.frames.filter(f => f.w).forEach((f, i) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;
    
            canvas.width = this.width
            canvas.height = this.height;
            document.body.appendChild(canvas);
            // if (this.backgroundColorIndex) {
            //     ctx.fillStyle = '#' + this.colors[this.backgroundColorIndex * 3].toString(16) + this.colors[this.backgroundColorIndex * 3 + 1].toString(16) + this.colors[this.backgroundColorIndex * 3 + 2].toString(16);
            //     ctx.fillStyle = 'rgba(0,0,0,0)';
            //     ctx.fillRect(0, 0, this.width, this.height);
            // }

            let imgData = ctx.createImageData(f.w, f.h);


            f.imgPoints.forEach((k, index) => {
                // if (!f.transparentColorFlag || f.transparentColorIndex !== k) {
                imgData.data[index * 4] = f.colors[k * 3];
                imgData.data[index * 4 + 1] = f.colors[k * 3 + 1];
                imgData.data[index * 4 + 2] = f.colors[k * 3 + 2];
                imgData.data[index * 4 + 3] = f.transparentColorFlag && k === f.transparentColorIndex ? 0 : 255;

                // } else {
                //     imgData.data[index * 4] = 0;
                //     imgData.data[index * 4 + 1] = 0;
                //     imgData.data[index * 4 + 2] = 0;
                //     imgData.data[index * 4 + 3] = 0;
                // }
            });

            ctx.putImageData(imgData, f.x, f.y, 0, 0, f.w, f.h);

            if (f.methodType === 1 && lastCanvas) {
                imgData = ctx.getImageData(0, 0, this.width, this.height);
                const lastImageData = lastCanvas.getImageData(0, 0, this.width, this.height);
                for (var i = 0; i < imgData.data.length; i+=4) {
                    if (imgData.data[i+3] == 0) {
                        imgData.data[i] = lastImageData.data[i];
                        imgData.data[i+1] = lastImageData.data[i+1];
                        imgData.data[i+2] = lastImageData.data[i+2];
                        imgData.data[i+3] = lastImageData.data[i+3];
                    }
                }
                ctx.putImageData(imgData, 0, 0);
            }
            lastCanvas = ctx;

        });
        
    }

    frames: Frame[] = [];


    private offset = 0;

    /**
     * gif 宽度
     *
     * @type {number}
     * @memberof Gif
     */
    public width!: number;

    /**
     * gif高度
     *
     * @type {number}
     * @memberof Gif
     */
    public height!: number;


    /**
     * 如果其为 true ，则表示存在 Global Color Table。如果为 false，则没有 Global Color Table
     *
     * @type {boolean}
     * @memberof Gif
     */
    globalColorTableFlag: boolean = false;

    /**
     * 用于表示色彩分辨率，如果为 s，则 Global Color Table 的颜色数为 2^(s+1)个，如果这是 s = 1,则一共有 4 中颜色，即每个像素可以用 2位（二进制） 来表示
     *
     * @type {number}
     * @memberof Gif
     */
    colorResolution: number = 1;

    /**
     * 如果为 false 则 Global Color Table 不进行排序，为 true 则表示 Global Color Table 按照降序排列，出现频率最多的颜色排在最前面。
     *
     * @type {boolean}
     * @memberof Gif
     */
    sortFlag: boolean = false;

    /**
     * 如其值为 s，则全局列表颜色个数的计算公式为 2^(s+1)。如 s = 1，则 Global Color Table 包含 4 个颜色
     *
     * @type {number}
     * @memberof Gif
     */
    sizeOfGlobalColorTable: number = 1;


    /**
     * 表示 GIF 的背景色在 Global Color Table 中的索引。
     *
     * @type {number}
     * @memberof Gif
     */
    backgroundColorIndex!: number;

    // 表示 GIF 的背景色在 Global Color Table 中的索引。
    pixelAspectRatio!: number;

    colors: number[] = [];

    loaded = false;


    version!: string;

    read(len = 1) {
        return this.dataSource.slice(this.offset, this.offset += len);
    }

    readOne() {
        return this.dataSource.slice(this.offset, this.offset += 1)[0];
    }

    _read(len) {
        return this.dataSource.slice(this.offset, this.offset + len);
    }

    getDataType() {
        return this.dataSource.slice(this.offset, this.offset + 1)[0];
    }

    private readHeader() {
        const type = this.read(3).reduce((str, code) => str + String.fromCharCode(code), '');

        if (type !== 'GIF') {
            throw new Error('gif签名无效');
        }

        const version = this.read(3).reduce((str, code) => str + String.fromCharCode(code), '')
        this.version = version;

    }

    private readLogicalScreenDescriptor() {
        const w = this.readOne() + (this.readOne() << 8);
        const h = this.readOne() + (this.readOne() << 8);
        this.width = w;
        this.height = h;
        const m = this.readOne();
        this.globalColorTableFlag = !!(1 & m >> 7);

        this.sizeOfGlobalColorTable = 0b0111 & m;

        this.sortFlag = !!(1 & (m >> 3));

        this.colorResolution = (0b111 & m >> 4);

        this.backgroundColorIndex = this.readOne();
        this.pixelAspectRatio = this.readOne();
    }

    private readColorTable(len: number) {
        const colors: number[] = [];
        let index = 3;
        while (index <= len) {
            // TODO: 看看有没有更好的方法
            let rpg = this.read(3);
            colors.push(rpg[0]);
            colors.push(rpg[1]);
            colors.push(rpg[2]);
            index += 3;
        };
        return colors;
    }

    public readExtension() {
        switch (this.readOne()) {
            case CONSTANT_FALG.extension: {
                switch (this.readOne()) {
                    case CONSTANT_FALG.imageExtension:
                        this.readGraphicsControlExtension();
                        break;
                    case CONSTANT_FALG.commentExtension:
                        this.readCommentExtension();
                        break;
                    case CONSTANT_FALG.applicationExtension:
                        this.readApplicationExtension();
                        break;
                    case CONSTANT_FALG.plainTextExtension:
                        this.readPlainTextExtension();
                        break;
                    default:
                        break;
                }
                break;
            }
            case CONSTANT_FALG.imageDescriptor: {
                this.readImageDescriptor();
                break;
            }
            case CONSTANT_FALG.endFlag: {
                this.loaded = true;
                break;
            }
            case 0:
                break;
            default:
                console.log(this.getDataType());
                throw new Error('错误的格式');
                break;
        }
    }

    /**
     * name
     */
    public readGraphicsControlExtension() {
        this.readOne(); // 跳过
        const m = this.readOne();


        const methodType = 0b111 & m >> 2;
        const useInput = !!(0b1 & m >> 1);
        const transparentColorFlag = !!(m & 0b1);
        console.log(transparentColorFlag);
        const delay = this.readOne() + (this.readOne() << 8);
        // console.log('delay', delay, this.getDataType());

        const transparentColorIndex = this.readOne();

        this.currentOptions = {
            methodType,
            useInput,
            transparentColorFlag,
            delay,
            transparentColorIndex
        };
        this.readOne();
    }

    public readImageDescriptor() {
        const option = this.currentOptions || { methodType: 0, useInput: false, transparentColorFlag: false, delay: 0 };

        const frame = new Frame(option);
        this.frames.push(frame);
        this.currentOptions = undefined;


        frame.x = this.readOne() + (this.readOne() << 8);
        frame.y = this.readOne() + (this.readOne() << 8);
        frame.w = this.readOne() + (this.readOne() << 8);
        frame.h = this.readOne() + (this.readOne() << 8);

        const m = this.readOne();
        frame.isLocalColor = !!(0b1 & m >> 7);
        frame.isInterlace = !!(0b1 & m >> 6);
        frame.isSort = !!(0b1 & m >> 5);
        frame.sizeOfLocalColors = (0b111 & m);

        if (!frame.isLocalColor) {
            frame.colors = this.colors;
        } else {
            const len = frame.sizeOfLocalColors;
            frame.colors = this.readColorTable(len);
        }

        // 解析图像数据

        const colorDepth = this.readOne();
        let data: number[] = []
        while (true) {
            let len = this.readOne();
            if (len) {
                this.read(len).forEach(v => data.push(v));
            } else {
                const lzwDecode = new LzwDecode(colorDepth);
                frame.setImageData(lzwDecode.decode(new Uint8Array(data)));
                break;
            }
        }


    }

    public readPlainTextExtension() {
        const len = this.readOne();
        this.read(len); // 暂时不处理, 直接跳过
    }

    public readApplicationExtension() {
        const len = this.readOne();
        // TODO: 待完成
        this.read(len);
        while (this.getDataType()) {
            this.readOne();
        }
    }

    public readCommentExtension() {
        const len = this.readOne();
        this.read(len + 1); // 暂时不处理, 直接跳过
    }
}
(window as any).LzwDecode = LzwDecode;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
canvas.width = 10;
canvas.height = 10;
(window as any).ctx = canvas.getContext('2d');