import axios, { Method } from 'axios';
import rateLimit from 'axios-rate-limit';
import { createPersistStore, underline2Camelcase } from 'background/utils';
import { TX_TYPE_ENUM } from 'consts';

interface OpenApiConfigValue {
  path: string;
  method: Method;
  params?: string[];
}

interface OpenApiStore {
  host: string;
  config: Record<string, OpenApiConfigValue>;
}

export interface ServerChain {
  id: string;
  community_id: number;
  name: string;
  native_token_id: string;
  logo_url: string;
  wrapped_token_id: string;
  symbol: string;
}

export interface ChainWithBalance extends ServerChain {
  usd_value: number;
}

export interface ChainWithPendingCount extends ServerChain {
  pending_tx_count: number;
}

export type SecurityCheckDecision =
  | 'pass'
  | 'warning'
  | 'danger'
  | 'forbidden'
  | 'loading'
  | 'pending';

export interface SecurityCheckItem {
  alert: string;
  id: number;
}

export interface SecurityCheckResponse {
  decision: SecurityCheckDecision;
  alert: string;
  danger_list: SecurityCheckItem[];
  warning_list: SecurityCheckItem[];
  forbidden_list: SecurityCheckItem[];
}

export interface Tx {
  chainId: number;
  data: string;
  from: string;
  gas: string;
  gasPrice: string;
  nonce: string;
  to: string;
  value: string;
  r?: string;
  s?: string;
  v?: string;
}

interface AssertsChange {
  amount: number;
  chain: string;
  decimals: number;
  display_symbol: string | null;
  id: string;
  is_core: boolean;
  is_verified: boolean;
  is_wallet: boolean;
  logo_url: string;
  name: string;
  optimized_symbol: string;
  price: number;
  symbol: string;
  time_at: number;
}

export interface NativeToken {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  display_symbol: string | null;
  optimized_symbol: string;
  decimals: number;
  logo_url: string;
  price: number;
  is_verified: boolean;
  is_core: boolean;
  is_wallet: boolean;
  time_at: number;
}

export interface GasResult {
  estimated_gas_cost_usd_value: number;
  estimated_gas_cost_value: number;
  estimated_gas_used: number;
  estimated_seconds: number;
  front_tx_count: number;
  max_gas_cost_usd_value: number;
  max_gas_cost_value: number;
}

export interface ExplainTxResponse {
  gas: GasResult;
  native_token: NativeToken;
  pre_exec: {
    assets_change: AssertsChange[];
    err_msg: string;
    success: boolean;
    tx_type: TX_TYPE_ENUM;
  };
  tags: string[];
  tx: Tx;
}

export interface GasLevel {
  level: string;
  price: number;
  front_tx_count: number;
  estimated_seconds: number;
}

export const EVM_RPC_METHODS = [
  'eth_getTransactionCount',
  'eth_blockNumber',
  'eth_call',
  'eth_estimateGas',
];

interface OpenApiService {
  ethCall(chainId: string, params: any[]): Promise<any>;
  ethGetTransactionCount(chainId: string, params: any[]): Promise<any>;
  ethBlockNumber(chainId: string): Promise<any>;
}

class OpenApiService implements OpenApiService {
  store!: OpenApiStore;

  request = rateLimit(axios.create(), { maxRPS: 25 });

  setHost = async (host: string) => {
    this.store.host = host;
    await this.init();
  };

  getHost = () => {
    return this.store.host;
  };

  init = async () => {
    this.store = await createPersistStore({
      name: 'openapi',
      template: {
        host: 'https://alpha-openapi.debank.com',
        config: {
          get_supported_chains: {
            path: '/v1/wallet/supported_chains',
            method: 'get',
            params: [],
          },
          get_total_balance: {
            path: '/v1/user/total_balance',
            method: 'get',
            params: ['id'],
          },
          get_pending_tx_count: {
            path: '/v1/wallet/pending_tx_count',
            method: 'get',
            params: ['id'],
          },
          // 按照优先级从高到低返回多个
          // chain会返回整个对象，其中会包含comunity_id，作为客户端标准id
          recommend_chains: {
            path: '/v1/wallet/recommend_chains',
            method: 'get',
            params: ['origin', 'id'],
          },
          check_origin_to_connect: {
            path: '/v1/wallet/security/check_origin',
            method: 'get',
          },
          explain_origin_to_connect: {
            path: '/v1/wallet/explain_origin',
            method: 'get',
            params: ['origin', 'title', 'return_logo'],
          },
          // 文本签名
          explain_text_to_sign: {
            path: '/v1/wallet/api/explain_text',
            method: 'get',
            params: ['origin', 'text', 'user_addr'],
          },
          check_text_to_sign: {
            path: '/v1/wallet/check_text',
            method: 'post',
            params: ['origin', 'text', 'user_addr'],
          },
          // 交易签名解释
          // 1. 地址和调用函数说明，或者是其他行为，比如转账、授权等等；以及，当前链是否由这个交互地址
          // 2. 预执行是否成功
          // 3. 实际消耗的 gas，以及预估打包时间
          // 4. 代币余额变化
          explain_tx_to_sign: {
            path: '/v1/wallet/explain_tx',
            method: 'get',
          },
          check_tx_to_sign: {
            path: '/v1/wallet/check_tx',
            method: 'post',
          },
          gas_market: {
            path: '/v1/wallet/gas_market',
            method: 'get',
            params: ['chainId', 'custom_price'],
          },
          push_tx: {
            path: '/v1/wallet/push_tx',
            method: 'get',
          },
        },
      },
    });

    this.request = rateLimit(
      axios.create({
        baseURL: this.store.host,
      }),
      { maxRPS: 25 }
    );
    try {
      await this.getConfig();
      this._mountMethods(EVM_RPC_METHODS);
    } catch (e) {
      console.error('[rabby] openapi init error', e);
    }
  };

  getConfig = async () => {
    const { data } = await this.request.get<Record<string, OpenApiConfigValue>>(
      `${this.store.host}/v1/wallet/config`
    );

    for (const key in data) {
      data[key].method = data[key].method.toLowerCase() as Method;
    }

    this.store.config = data;
  };

  private _mountMethods = (methods: string[]) => {
    methods.forEach((method) => {
      const config = this.store.config[method];

      const [, ...rest] = config.params || [];
      this[underline2Camelcase(method)] = (chainId, params) => {
        const reqData = {
          chain_id: chainId,
          ...rest.reduce((m, n, i) => {
            m[n] = params[i];

            return m;
          }, {}),
        };

        if (config.method === 'post') {
          console.log(params);
        }

        const _config = config.method === 'get' ? { params: reqData } : reqData;

        return this.request[config.method](config.path, _config).then(
          ({ data }) => data?.result
        );
      };
    });
  };

  getSupportedChains = async (): Promise<ServerChain[]> => {
    const config = this.store.config.get_supported_chains;
    const { data } = await this.request[config.method](config.path);
    return data;
  };

  getRecommendChains = async (
    address: string,
    origin: string
  ): Promise<ServerChain[]> => {
    const config = this.store.config.recommend_chains;
    const { data } = await this.request[config.method](config.path, {
      params: {
        user_addr: address.toLowerCase(),
        origin,
      },
    });
    return data;
  };

  getTotalBalance = async (
    address: string
  ): Promise<{ total_usd_value: number; chain_list: ChainWithBalance[] }> => {
    const config = this.store.config.get_total_balance;
    const { data } = await this.request[config.method](config.path, {
      params: {
        id: address.toLowerCase(),
      },
    });
    return data;
  };

  getPendingCount = async (
    address: string
  ): Promise<{ total_count: number; chains: ChainWithPendingCount[] }> => {
    const config = this.store.config.get_pending_tx_count;
    const { data } = await this.request[config.method](config.path, {
      params: {
        user_addr: address.toLowerCase(),
      },
    });
    return data;
  };

  checkOrigin = async (
    address: string,
    origin: string
  ): Promise<SecurityCheckResponse> => {
    const config = this.store.config.check_origin;
    const { data } = await this.request[config.method](config.path, {
      params: {
        user_addr: address.toLowerCase(),
        origin,
      },
    });

    return data;
  };

  checkText = async (
    address: string,
    origin: string,
    text: string
  ): Promise<SecurityCheckResponse> => {
    const config = this.store.config.check_text;
    const { data } = await this.request[config.method](config.path, {
      user_addr: address.toLowerCase(),
      origin,
      text,
    });
    return data;
  };

  checkTx = async (
    tx: Tx,
    origin: string,
    address: string,
    update_nonce = false
  ): Promise<SecurityCheckResponse> => {
    const config = this.store.config.check_tx;
    const { data } = await this.request[config.method](config.path, {
      user_addr: address.toLowerCase(),
      origin,
      tx,
      update_nonce,
    });

    return data;
  };

  explainTx = async (
    tx: Tx,
    origin: string,
    address: string,
    update_nonce = false
  ): Promise<ExplainTxResponse> => {
    const config = this.store.config.explain_tx;
    const { data } = await this.request[config.method](config.path, {
      tx,
      user_addr: address.toLowerCase(),
      origin,
      update_nonce,
    });

    return data;
  };

  pushTx = async (tx: Tx) => {
    const config = this.store.config.push_tx;
    const { data } = await this.request[config.method](config.path, {
      tx,
    });

    return data;
  };

  explainText = async (
    origin: string,
    address: string,
    text: string
  ): Promise<{ comment: string }> => {
    const config = this.store.config.explain_text;
    const { data } = await this.request[config.method](config.path, {
      user_addr: address.toLowerCase(),
      origin,
      text,
    });

    return data;
  };

  gasMarket = async (
    chainId: string,
    customGas?: number
  ): Promise<GasLevel[]> => {
    const config = this.store.config.gas_market;
    const { data } = await this.request[config.method](config.path, {
      params: {
        chain_id: chainId,
        custom_price: customGas,
      },
    });

    return data;
  };
}

export default new OpenApiService();