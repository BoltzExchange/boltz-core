import fs from 'fs';
import WebSocket from 'ws';
import uuidv1 from 'uuid/v1';
import { EventEmitter } from 'events';

type RpcConfig = {
  host: string;
  port: number;
  rpcuser: string;
  rpcpass: string;
  certpath: string;
};

/** A hack to make promises handleable from other functions */
type PromiseFunctions = {
  resolve: Function;
  reject: Function;
};

interface RpcClient {
  on(event: 'error', listener: (error: string) => void): this;
  on(event: 'message.orphan', listener: (message: any) => void): this;
  emit(event: 'error', error: string): boolean;
  emit(event: 'message.orphan', message: any): boolean;
}

class RpcClient extends EventEmitter {
  public ws!: WebSocket;

  private readonly config: RpcConfig = {
    host: '127.0.0.1',
    port: 18556,
    rpcuser: 'user',
    rpcpass: 'user',
    certpath: 'docker/rpc.cert',
  };

  private rpcCert: string;
  private authorization: string;

  /** A map between request ids and their pending Promises */
  private pendingRequests = new Map<string, PromiseFunctions>();

  constructor() {
    super();

    this.rpcCert = fs.readFileSync(this.config.certpath, { encoding: 'utf-8' });

    const credentials = Buffer.from(`${this.config.rpcuser}:${this.config.rpcpass}`);
    this.authorization =  `Basic ${credentials.toString('base64')}`;
  }

  public connect = async () => {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`wss://${this.config.host}:${this.config.port}/ws`, {
        headers: {
          Authorization: this.authorization,
        },
        cert: [this.rpcCert],
        ca: [this.rpcCert],
      });

      this.ws.onopen = () => {
        this.bindWebSocket();
        resolve();
      };

      this.ws.onerror = error => reject(error.message);
      this.ws.on('error', error => reject(error.message));
    });
  }

  public close = async () => {
    this.ws.close();
  }

  public call = async <T>(method: string, ...params: any[]): Promise<T> => {
    const id = uuidv1();
    const promise = new Promise<any>((resolve, reject) => {
      const message = {
        id,
        method,
        params,
      };

      this.ws.send(JSON.stringify(message), (error) => {
        if (error) {
          this.pendingRequests.delete(message.id);
          reject(error.message);

        } else {
          this.pendingRequests.set(id, {
            resolve,
            reject,
          });
        }
      });
    });

    return promise;
  }

  private bindWebSocket = () => {
    this.ws.onerror = error => this.emitError(error);
    this.ws.on('error', error => this.emitError(error));

    this.ws.on('message', (rawData) => {
      const data = JSON.parse(rawData.toString());

      // Messages that don't have an id are not a direct reponse to a request, don't have
      // a promise that has to be resolved and therefore should be handled separately
      if (data.id) {
        const promise = this.pendingRequests.get(data.id);

        if (promise) {
          this.pendingRequests.delete(data.id);

          if (!data.error) {
            promise.resolve(data.result);
          } else {
            promise.reject(data.error);
          }
        }
      } else {
        this.emit('message.orphan', data);
      }
    });
  }

  private emitError = (error: { message: string }) => {
    this.emit('error', error.message);
  }
}

export default RpcClient;
