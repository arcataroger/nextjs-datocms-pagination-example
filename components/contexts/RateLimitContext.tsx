"use client";
import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useCallback,
    useRef,
    useState,
    useMemo,
} from "react";

export const DATOCMS_CDA_RATE_LIMIT_PER_SECOND =
    (process?.env?.DATOCMS_CDA_RATE_LIMIT_PER_SECOND as unknown as number) ?? 60;
export const DATOCMS_CDA_RATE_LIMIT_PER_MINUTE =
    (process?.env?.DATOCMS_CDA_RATE_LIMIT_PER_MINUTE as unknown as number) ??
    1000;

export interface RateLimitContextProps {
    tokensPerSecondRemaining: number;
    tokensPerMinuteRemaining: number;
    perSecondCountdown: number;
    perMinuteCountdown: number;
    consumeToken: () => Promise<void>;
    executePromisesWithRateLimit: (
        promiseFns: (() => Promise<unknown>)[],
        onProgressUpdate: (completed: number, pending: number) => void
    ) => Promise<unknown[]>;
}

const RateLimitContext = createContext<RateLimitContextProps>({
    tokensPerSecondRemaining: DATOCMS_CDA_RATE_LIMIT_PER_SECOND,
    tokensPerMinuteRemaining: DATOCMS_CDA_RATE_LIMIT_PER_MINUTE,
    perSecondCountdown: 0,
    perMinuteCountdown: 0,
    consumeToken: () => Promise.resolve(),
    executePromisesWithRateLimit: () => Promise.resolve([]),
});

interface RateLimitProviderProps {
    children: ReactNode;
    bufferPercentage?: number;
}

export const RateLimitProvider = ({
                                      children,
                                      bufferPercentage = 10,
                                  }: RateLimitProviderProps) => {
    const maxTokensPerSecond = DATOCMS_CDA_RATE_LIMIT_PER_SECOND;
    const maxTokensPerMinute = DATOCMS_CDA_RATE_LIMIT_PER_MINUTE;

    // Adjust tokens based on buffer using useMemo
    const adjustedMaxTokensPerSecond = useMemo(() => {
        return maxTokensPerSecond * (1 - bufferPercentage / 100);
    }, [maxTokensPerSecond, bufferPercentage]);

    const adjustedMaxTokensPerMinute = useMemo(() => {
        return maxTokensPerMinute * (1 - bufferPercentage / 100);
    }, [maxTokensPerMinute, bufferPercentage]);

    // Use refs to track tokens to avoid re-renders
    const tokensPerSecondRemainingRef = useRef<number>(
        adjustedMaxTokensPerSecond
    );
    const tokensPerMinuteRemainingRef = useRef<number>(
        adjustedMaxTokensPerMinute
    );

    // State only to display the tokens, not used for logic
    const [tokensPerSecondRemaining, setTokensPerSecondRemaining] = useState<
        number
    >(adjustedMaxTokensPerSecond);
    const [tokensPerMinuteRemaining, setTokensPerMinuteRemaining] = useState<
        number
    >(adjustedMaxTokensPerMinute);

    // State for countdown timers
    const [perSecondCountdown, setPerSecondCountdown] = useState<number>(0);
    const [perMinuteCountdown, setPerMinuteCountdown] = useState<number>(0);

    // Memoize consumeToken to prevent redefinition on every render
    const consumeToken = useCallback(async (): Promise<void> => {
        while (
            tokensPerSecondRemainingRef.current <= 0 ||
            tokensPerMinuteRemainingRef.current <= 0
            ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Update the refs (logic) without causing a re-render
        tokensPerSecondRemainingRef.current = Math.max(
            tokensPerSecondRemainingRef.current - 1,
            0
        );
        tokensPerMinuteRemainingRef.current = Math.max(
            tokensPerMinuteRemainingRef.current - 1,
            0
        );

        // Update the state if you want to display the tokens in the UI
        setTokensPerSecondRemaining(tokensPerSecondRemainingRef.current);
        setTokensPerMinuteRemaining(tokensPerMinuteRemainingRef.current);
    }, []);

    // Refs to track the next refill times
    const nextPerSecondRefill = useRef<number>(Date.now() + 1000);
    const nextPerMinuteRefill = useRef<number>(Date.now() + 60000);

    useEffect(() => {
        const updateCountdowns = () => {
            const now = Date.now();
            setPerSecondCountdown(
                Math.max((nextPerSecondRefill.current - now) / 1000, 0)
            );
            setPerMinuteCountdown(
                Math.max((nextPerMinuteRefill.current - now) / 1000, 0)
            );
        };

        // Update countdowns every 100ms
        const countdownInterval = setInterval(updateCountdowns, 100);

        // Refill tokens and reset timers
        const perSecondInterval = setInterval(() => {
            tokensPerSecondRemainingRef.current = adjustedMaxTokensPerSecond
            setTokensPerSecondRemaining(tokensPerSecondRemainingRef.current);

            // Set next per-second refill time
            nextPerSecondRefill.current = Date.now() + 1000;
        }, 1000);

        const perMinuteInterval = setInterval(() => {
            tokensPerMinuteRemainingRef.current = adjustedMaxTokensPerMinute;
            setTokensPerMinuteRemaining(tokensPerMinuteRemainingRef.current);

            tokensPerSecondRemainingRef.current = adjustedMaxTokensPerSecond;
            setTokensPerSecondRemaining(tokensPerSecondRemainingRef.current);

            // Set next per-minute refill time
            nextPerMinuteRefill.current = Date.now() + 60000;
        }, 60000);

        return () => {
            clearInterval(countdownInterval);
            clearInterval(perSecondInterval);
            clearInterval(perMinuteInterval);
        };
    }, [adjustedMaxTokensPerSecond, adjustedMaxTokensPerMinute]);

    // Memoized function to execute promises with rate limiting
    const executePromisesWithRateLimit = useCallback(
        async (
            promiseFns: (() => Promise<unknown>)[],
            onProgressUpdate: (completed: number, pending: number) => void
        ): Promise<unknown[]> => {
            const results: unknown[] = [];
            const totalPromises = promiseFns.length;
            let completed = 0;

            for (const promiseFn of promiseFns) {
                await consumeToken(); // Wait for tokens before making the request
                const result = await promiseFn(); // Execute the promise
                results.push(result);
                completed++;
                onProgressUpdate(completed, totalPromises - completed); // Update the progress via the callback
            }

            return results;
        },
        [consumeToken]
    );

    return (
        <RateLimitContext.Provider
            value={{
                tokensPerSecondRemaining,
                tokensPerMinuteRemaining,
                perSecondCountdown,
                perMinuteCountdown,
                consumeToken,
                executePromisesWithRateLimit,
            }}
        >
            {children}
        </RateLimitContext.Provider>
    );
};

// Custom hook to use the RateLimitContext
export const useRateLimit = (): RateLimitContextProps => {
    const context = useContext(RateLimitContext);
    if (!context) {
        throw new Error("useRateLimit must be used within a RateLimitProvider");
    }
    return context;
};