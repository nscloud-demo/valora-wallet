import BigNumber from 'bignumber.js'
import DeviceInfo from 'react-native-device-info'
import { TIME_UNTIL_TOKEN_INFO_BECOMES_STALE, TOKEN_MIN_AMOUNT } from 'src/config'
import { usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import useSelector from 'src/redux/useSelector'
import { getDynamicConfigParams } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs } from 'src/statsig/types'
import {
  tokenCompareByUsdBalanceThenByName,
  tokensByAddressSelector,
  tokensByCurrencySelector,
  tokensByIdSelectorWrapper,
  tokensListSelectorWrapper,
  tokensListWithAddressSelector,
  tokensWithUsdValueSelectorWrapper,
  totalTokenBalanceSelectorWrapper,
} from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import {
  convertLocalToTokenAmount,
  convertTokenToLocalAmount,
  getSupportedNetworkIdsForTokenBalances,
  isCicoToken,
  usdBalance,
} from 'src/tokens/utils'
import { NetworkId } from 'src/transactions/types'
import { Currency } from 'src/utils/currencies'
import { isVersionBelowMinimum } from 'src/utils/versionCheck'
import networkConfig from 'src/web3/networkConfig'

/**
 * @deprecated use useTokenInfo and select using tokenId
 */
export function useTokenInfoByAddress(tokenAddress?: string | null) {
  const tokens = useSelector(tokensByAddressSelector)
  return tokenAddress ? tokens[tokenAddress] : undefined
}

export function useTokensWithUsdValue(networkIds: NetworkId[]) {
  return useSelector(tokensWithUsdValueSelectorWrapper(networkIds))
}

export function useTotalTokenBalance() {
  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  return useSelector(totalTokenBalanceSelectorWrapper(supportedNetworkIds))
}

export function useTokensWithTokenBalance() {
  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  const tokens = useSelector(tokensListSelectorWrapper(supportedNetworkIds))
  return tokens.filter((tokenInfo) => tokenInfo.balance.gt(TOKEN_MIN_AMOUNT))
}

export function useTokensForAssetsScreen() {
  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  const tokens = useSelector(tokensListSelectorWrapper(supportedNetworkIds))

  return tokens
    .filter((tokenInfo) => tokenInfo.balance.gt(TOKEN_MIN_AMOUNT) || tokenInfo.showZeroBalance)
    .sort((token1, token2) => {
      // Sorts by usd balance, then token balance, then zero balance natives by
      // network id, then zero balance non natives by network id
      const usdBalanceCompare = usdBalance(token2).comparedTo(usdBalance(token1))
      if (usdBalanceCompare) {
        return usdBalanceCompare
      }

      const balanceCompare = token2.balance.comparedTo(token1.balance)
      if (balanceCompare) {
        return balanceCompare
      }

      if (token1.isNative && !token2.isNative) {
        return -1
      }
      if (!token1.isNative && token2.isNative) {
        return 1
      }

      return token1.networkId.localeCompare(token2.networkId)
    })
}

export function useTokensInfoUnavailable(networkIds: NetworkId[]) {
  const totalBalance = useSelector(totalTokenBalanceSelectorWrapper(networkIds))
  return totalBalance === null
}

export function useTokensList() {
  const networkIds = Object.values(networkConfig.networkToNetworkId)
  return useSelector(tokensListSelectorWrapper(networkIds))
}

export function useTokenPricesAreStale(networkIds: NetworkId[]) {
  const tokens = useSelector(tokensListSelectorWrapper(networkIds))
  // If no tokens then prices cannot be stale
  if (tokens.length === 0) return false
  // Put tokens with priceUsd into an array
  const tokensWithUsdValue = tokens.filter((tokenInfo) => tokenInfo.priceUsd !== null)
  // If tokens with usd value exist, check the time price was fetched and if ANY are stale - return true
  // Else tokens usd values are not present so we know prices are stale - return true
  if (tokensWithUsdValue.length > 0) {
    return tokensWithUsdValue.some(
      (tokenInfo) =>
        (tokenInfo.priceFetchedAt ?? 0) < Date.now() - TIME_UNTIL_TOKEN_INFO_BECOMES_STALE
    )
  } else {
    return true
  }
}

export function useSendableTokens() {
  const networkIdsForSend = getDynamicConfigParams(
    DynamicConfigs[StatsigDynamicConfigs.MULTI_CHAIN_FEATURES]
  ).showSend
  const tokens = useSelector(tokensListSelectorWrapper(networkIdsForSend))
  return tokens.filter((tokenInfo) => tokenInfo.balance.gt(TOKEN_MIN_AMOUNT))
}

export function useSwappableTokens() {
  const appVersion = DeviceInfo.getVersion()
  const networkIdsForSwap = getDynamicConfigParams(
    DynamicConfigs[StatsigDynamicConfigs.MULTI_CHAIN_FEATURES]
  ).showSwap
  const tokens = useSelector(tokensListSelectorWrapper(networkIdsForSwap))
  return tokens
    .filter(
      (tokenInfo) =>
        tokenInfo.isSwappable ||
        (tokenInfo.minimumAppVersionToSwap &&
          !isVersionBelowMinimum(appVersion, tokenInfo.minimumAppVersionToSwap))
    )
    .sort(tokenCompareByUsdBalanceThenByName)
}

export function useCashInTokens() {
  const networkIdsForCico = getDynamicConfigParams(
    DynamicConfigs[StatsigDynamicConfigs.MULTI_CHAIN_FEATURES]
  ).showCico
  const tokens = useSelector(tokensListSelectorWrapper(networkIdsForCico))
  return tokens.filter((tokenInfo) => tokenInfo.isCashInEligible && isCicoToken(tokenInfo.symbol))
}

export function useCashOutTokens() {
  const networkIdsForCico = getDynamicConfigParams(
    DynamicConfigs[StatsigDynamicConfigs.MULTI_CHAIN_FEATURES]
  ).showCico
  const tokens = useSelector(tokensListSelectorWrapper(networkIdsForCico))
  return tokens.filter(
    (tokenInfo) =>
      tokenInfo.balance.gt(TOKEN_MIN_AMOUNT) &&
      tokenInfo.isCashOutEligible &&
      isCicoToken(tokenInfo.symbol)
  )
}

export function useTokenInfo(tokenId?: string): TokenBalance | undefined {
  const networkIds = Object.values(networkConfig.networkToNetworkId)
  const tokens = useSelector(tokensByIdSelectorWrapper(networkIds))
  return tokenId ? tokens[tokenId] : undefined
}

/**
 * @deprecated
 */
export function useTokenInfoWithAddressBySymbol(symbol: string) {
  const tokens = useSelector(tokensListWithAddressSelector)
  return tokens.find((tokenInfo) => tokenInfo.symbol === symbol)
}

export function useTokenInfoByCurrency(currency: Currency) {
  const tokens = useSelector(tokensByCurrencySelector)
  return tokens[currency]
}

export function useLocalToTokenAmount(
  localAmount: BigNumber,
  tokenAddress?: string | null
): BigNumber | null {
  const tokenInfo = useTokenInfoByAddress(tokenAddress)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  return convertLocalToTokenAmount({
    localAmount,
    tokenInfo,
    usdToLocalRate,
  })
}

export function useTokenToLocalAmount(
  tokenAmount: BigNumber,
  tokenAddress?: string | null
): BigNumber | null {
  const tokenInfo = useTokenInfoByAddress(tokenAddress)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  return convertTokenToLocalAmount({
    tokenAmount,
    tokenInfo,
    usdToLocalRate,
  })
}

export function useAmountAsUsd(amount: BigNumber, tokenAddress: string) {
  const tokenInfo = useTokenInfoByAddress(tokenAddress)
  if (!tokenInfo?.priceUsd) {
    return null
  }
  return amount.multipliedBy(tokenInfo.priceUsd)
}

export function useUsdToTokenAmount(amount: BigNumber, tokenAddress?: string | null) {
  const tokenInfo = useTokenInfoByAddress(tokenAddress)
  if (!tokenInfo?.priceUsd) {
    return null
  }
  return amount.div(tokenInfo.priceUsd)
}

export function useConvertBetweenTokens(
  amount: BigNumber | undefined,
  tokenAddress: string = '',
  newTokenAddress: string
) {
  const tokenBalances = useSelector(tokensByAddressSelector)

  const tokenPriceUsd = tokenBalances[tokenAddress ?? '']?.priceUsd
  const newTokenPriceUsd = tokenBalances[newTokenAddress]?.priceUsd
  if (!amount || !tokenPriceUsd || !newTokenPriceUsd) {
    return null
  }
  return amount.multipliedBy(tokenPriceUsd).dividedBy(newTokenPriceUsd)
}
