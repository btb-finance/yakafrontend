'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function WalletConnect() {
    return (
        <ConnectButton.Custom>
            {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                mounted,
            }) => {
                const ready = mounted;
                const connected = ready && account && chain;

                return (
                    <div
                        {...(!ready && {
                            'aria-hidden': true,
                            style: {
                                opacity: 0,
                                pointerEvents: 'none',
                                userSelect: 'none',
                            },
                        })}
                    >
                        {(() => {
                            if (!connected) {
                                return (
                                    <button
                                        onClick={openConnectModal}
                                        className="btn-primary text-sm md:text-base px-3 md:px-6 py-2 md:py-3"
                                    >
                                        <span className="hidden md:inline">Connect Wallet</span>
                                        <span className="md:hidden">Connect</span>
                                    </button>
                                );
                            }

                            if (chain.unsupported) {
                                return (
                                    <button
                                        onClick={openChainModal}
                                        className="btn-warning text-sm px-3 py-2"
                                    >
                                        Wrong Network
                                    </button>
                                );
                            }

                            return (
                                <div className="flex items-center gap-2 md:gap-3">
                                    {/* Chain selector - hidden on mobile */}
                                    <button
                                        onClick={openChainModal}
                                        className="hidden md:flex btn-secondary items-center gap-2"
                                    >
                                        {chain.hasIcon && (
                                            <div
                                                className="w-5 h-5 rounded-full overflow-hidden"
                                                style={{ background: chain.iconBackground }}
                                            >
                                                {chain.iconUrl && (
                                                    <img
                                                        alt={chain.name ?? 'Chain icon'}
                                                        src={chain.iconUrl}
                                                        className="w-5 h-5"
                                                    />
                                                )}
                                            </div>
                                        )}
                                        {chain.name}
                                    </button>

                                    {/* Account button - compact on mobile */}
                                    <button
                                        onClick={openAccountModal}
                                        className="btn-primary text-sm px-3 py-2 md:px-4"
                                    >
                                        {/* Mobile: just address */}
                                        <span className="md:hidden">{account.displayName}</span>
                                        {/* Desktop: address + balance */}
                                        <span className="hidden md:inline">
                                            {account.displayName}
                                            {account.displayBalance
                                                ? ` (${account.displayBalance})`
                                                : ''}
                                        </span>
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                );
            }}
        </ConnectButton.Custom>
    );
}
