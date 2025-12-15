'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface InfoCardProps {
    title: string;
    description: string | ReactNode;
    icon?: string;
    variant?: 'default' | 'success' | 'warning';
    action?: {
        label: string;
        onClick: () => void;
    };
}

export function InfoCard({ title, description, icon, variant = 'default', action }: InfoCardProps) {
    const variantStyles = {
        default: 'info-card',
        success: 'info-card info-card-success',
        warning: 'info-card info-card-warning',
    };

    const iconContainerStyles = {
        default: 'icon-container',
        success: 'icon-container icon-container-success',
        warning: 'icon-container icon-container-warning',
    };

    return (
        <motion.div
            className={variantStyles[variant]}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="flex items-start gap-4">
                {icon && (
                    <div className={`${iconContainerStyles[variant]} icon-container-sm`}>
                        {icon}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-white mb-1">{title}</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
                    {action && (
                        <button
                            onClick={action.onClick}
                            className="mt-3 text-sm font-medium text-primary hover:text-primary/80 transition"
                        >
                            {action.label} →
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// Feature highlight card
interface FeatureCardProps {
    title: string;
    description: string;
    icon: string;
    stat?: string;
    statLabel?: string;
}

export function FeatureCard({ title, description, icon, stat, statLabel }: FeatureCardProps) {
    return (
        <motion.div
            className="feature-card"
            whileHover={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 300 }}
        >
            <div className="icon-container mb-4" style={{ position: 'relative', zIndex: 1 }}>
                {icon}
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ position: 'relative', zIndex: 1 }}>{title}</h3>
            <p className="text-sm text-gray-400 mb-4" style={{ position: 'relative', zIndex: 1 }}>{description}</p>
            {stat && (
                <div className="pt-4 border-t border-white/10" style={{ position: 'relative', zIndex: 1 }}>
                    <div className="text-2xl font-bold text-primary">{stat}</div>
                    {statLabel && <div className="text-xs text-gray-500">{statLabel}</div>}
                </div>
            )}
        </motion.div>
    );
}

// Empty state component
interface EmptyStateProps {
    icon: string;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <motion.div
            className="empty-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="empty-state-icon">{icon}</div>
            <h3 className="empty-state-title">{title}</h3>
            <p className="empty-state-description">{description}</p>
            {action && (
                <button onClick={action.onClick} className="btn-primary">
                    {action.label}
                </button>
            )}
        </motion.div>
    );
}

// Reward display
interface RewardDisplayProps {
    amount: string;
    token: string;
    label?: string;
}

export function RewardDisplay({ amount, token, label }: RewardDisplayProps) {
    return (
        <div className="text-center">
            {label && <div className="text-xs text-gray-400 mb-1">{label}</div>}
            <div className="reward-badge">
                <span className="text-lg font-bold">{amount}</span>
                <span className="text-sm">{token}</span>
            </div>
        </div>
    );
}
