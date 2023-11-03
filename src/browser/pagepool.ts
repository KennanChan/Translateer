import { Browser, executablePath, Page } from "puppeteer";
import puppeteer from "./puppeteer";
import { retry } from "../utils/try";

const { PUPPETEER_WS_ENDPOINT } = process.env;

export let pagePool: PagePool;

interface QueuedPageRequest {
  id: string;
  resolve: (page: Page) => void;
  reject: (error: Error) => void;
  time: number;
  timeout: number;
}

export default class PagePool {
  private _pages: Page[] = [];
  private _pagesInUse: Page[] = [];
  private _browser!: Browser;
  private _queue: QueuedPageRequest[] = [];

  constructor(private pageCount: number = 5) {
    pagePool = this;
  }

  public async init() {
    await this._initBrowser();
    await this._initPages();

    // refresh pages every 1 hour to keep alive
    this._resetInterval(60 * 60 * 1000);
  }

  public getPage() {
    const page = this._pages.pop();
    if (!page) {
      return undefined;
    }
    this._pagesInUse.push(page);
    return page;
  }

  public waitForPage(timeout = 30000) {
    return new Promise<Page | undefined>((resolve, reject) => {
      const page = this.getPage();
      if (!page) {
        const id = Math.random().toString(36).substr(2, 9);
        const timeoutId = setTimeout(() => {
          const index = this._queue.findIndex((item) => item.id === id);
          if (index !== -1) {
            this._queue.splice(index, 1);
            reject(new Error("timeout"));
          }
        }, timeout);
        this._queue.push({
          id,
          resolve: (page) => {
            clearTimeout(timeoutId);
            resolve(page);
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            reject(error);
          },
          time: Date.now(),
          timeout,
        });
      } else {
        resolve(page);
      }
    });
  }

  private _dequeueRequest(): boolean {
    if (this._queue.length === 0) return true;
    const request = this._queue.shift();
    if (!request) {
      return false;
    }
    if (Date.now() - request.time > request.timeout) {
      request.reject(new Error("timeout"));
      return this._dequeueRequest();
    } else {
      const page = this.getPage();
      if (!page) {
        this._queue.unshift(request);
        return false;
      }
      request.resolve(page);
    }
    return true;
  }

  public releasePage(page: Page) {
    const index = this._pagesInUse.indexOf(page);
    if (index === -1) {
      return;
    }
    this._pagesInUse.splice(index, 1);
    this._pages.push(page);
    this._dequeueRequest();
  }

  private async _initBrowser() {
    this._browser = PUPPETEER_WS_ENDPOINT
      ? await puppeteer.connect({ browserWSEndpoint: PUPPETEER_WS_ENDPOINT })
      : await puppeteer.launch({
          ignoreHTTPSErrors: true,
          headless: process.env.DEBUG !== "true",
          executablePath: executablePath(),
        });
  }

  private async _initPages() {
    this._pages = await Promise.all(
      [...Array(this.pageCount)].map(() =>
        this._browser.newPage().then(async (page) => {
          await page.setRequestInterception(true);
          page.on("request", (req) => {
            if (
              req.resourceType() === "image" ||
              req.resourceType() === "stylesheet" ||
              req.resourceType() === "font"
            ) {
              req.abort();
            } else {
              req.continue();
            }
          });
          await this.openGoogleTranslate(page);
          // privacy consent
          try {
            const btnSelector = 'button[aria-label="Reject all"]';
            await page.waitForSelector(btnSelector, { timeout: 1000 });
            await page.$eval(btnSelector, (btn) => {
              (btn as HTMLButtonElement).click();
            });
            console.log("rejected privacy consent");
          } catch {
            console.log("no privacy consent");
          }
          return page;
        })
      )
    );
  }

  private async openGoogleTranslate(page: Page) {
    try {
      await retry(() => {
        return page.goto("https://translate.google.com/", {
          waitUntil: "networkidle2",
        });
      }, 5);
      return true;
    } catch (error) {
      console.log("error", error);
      return false;
    }
  }

  private _resetInterval(ms: number) {
    setInterval(async () => {
      this._pagesInUse = [];
      this._pages = [];
      this._browser.close();
      await this._initBrowser();
      await this._initPages();
    }, ms);
  }
}
