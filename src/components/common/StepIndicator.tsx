'use client';

import { motion } from 'framer-motion';

interface Step {
    label: string;
    icon?: string;
    description?: string;
}

interface StepIndicatorProps {
    steps: Step[];
    currentStep?: number;
    compact?: boolean;
}

export function StepIndicator({ steps, currentStep = 0, compact = false }: StepIndicatorProps) {
    return (
        <div className={`flex items-center justify-center ${compact ? 'gap-2' : 'gap-4'}`}>
            {steps.map((step, index) => (
                <div key={index} className="flex items-center gap-2 md:gap-4">
                    {/* Step */}
                    <motion.div
                        className="flex flex-col items-center text-center"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <div
                            className={`
                                flex items-center justify-center rounded-full font-semibold text-sm
                                ${compact ? 'w-8 h-8' : 'w-10 h-10 md:w-12 md:h-12 md:text-lg'}
                                ${index < currentStep
                                    ? 'bg-green-500 text-white'
                                    : index === currentStep
                                        ? 'bg-gradient-to-r from-primary to-secondary text-white'
                                        : 'bg-white/5 border-2 border-white/20 text-gray-400'
                                }
                            `}
                        >
                            {index < currentStep ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            ) : step.icon ? (
                                <span>{step.icon}</span>
                            ) : (
                                <span>{index + 1}</span>
                            )}
                        </div>
                        {!compact && (
                            <>
                                <span className={`mt-2 text-sm font-medium ${index <= currentStep ? 'text-white' : 'text-gray-500'}`}>
                                    {step.label}
                                </span>
                                {step.description && (
                                    <span className="text-xs text-gray-500 max-w-[100px] hidden md:block">
                                        {step.description}
                                    </span>
                                )}
                            </>
                        )}
                    </motion.div>

                    {/* Connector */}
                    {index < steps.length - 1 && (
                        <div
                            className={`
                                ${compact ? 'w-6 md:w-8' : 'w-8 md:w-16'} h-0.5 rounded-full
                                ${index < currentStep
                                    ? 'bg-green-500'
                                    : index === currentStep
                                        ? 'bg-gradient-to-r from-primary to-secondary'
                                        : 'bg-white/10'
                                }
                            `}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

// Pre-built step flows for common DeFi actions
export function LockVoteEarnSteps({ currentStep = 0 }: { currentStep?: number }) {
    return (
        <StepIndicator
            steps={[
                { label: 'Lock', icon: '🔐', description: 'Lock YAKA tokens' },
                { label: 'Vote', icon: '🗳️', description: 'Choose pools' },
                { label: 'Earn', icon: '💰', description: 'Get rewards' },
            ]}
            currentStep={currentStep}
        />
    );
}

export function AddLiquiditySteps({ currentStep = 0 }: { currentStep?: number }) {
    return (
        <StepIndicator
            steps={[
                { label: 'Select', icon: '🪙', description: 'Pick tokens' },
                { label: 'Amount', icon: '📊', description: 'Enter amounts' },
                { label: 'Confirm', icon: '✅', description: 'Add liquidity' },
            ]}
            currentStep={currentStep}
        />
    );
}
