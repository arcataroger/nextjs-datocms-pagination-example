"use client";
import { useRateLimit } from "@/components/contexts/RateLimitContext";
import { useEffect, useRef, useState } from "react";

export default function Home() {
    const {
        tokensPerSecondRemaining,
        tokensPerMinuteRemaining,
        perSecondCountdown,
        perMinuteCountdown,
        executePromisesWithRateLimit,
    } = useRateLimit();
    const [completedPromises, setCompletedPromises] = useState<number>(0);

    // Use refs to track the number of pending promises
    const pendingPromisesRef = useRef<number>(0);

    const totalPromises = 10000;

    useEffect(() => {
        // Create an array of 10,000 promise-generating functions
        const promiseFns = Array.from({ length: totalPromises }, (_, i) => {
            return () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(i); // Each promise resolves with its index
                    }, 10); // Simulate a 10-ms delay for each promise
                });
        });

        // Initialize the number of pending promises
        pendingPromisesRef.current = totalPromises;

        // Progress callback to update the state of pending/completed promises
        const onProgressUpdate = (completed: number, pending: number) => {
            pendingPromisesRef.current = pending; // Update the ref (no re-render)
            setCompletedPromises(completed); // Update the completed promises to re-render
        };

        // Execute the promises with rate limiting
        executePromisesWithRateLimit(promiseFns, onProgressUpdate).then(() => {
            console.log("All promises resolved");
        });
    }, [executePromisesWithRateLimit]);

    const progressPercentage = (completedPromises / totalPromises) * 100;

    // Calculate minutes and seconds for per-minute countdown
    const perMinuteCountdownMinutes = Math.floor(perMinuteCountdown / 60);
    const perMinuteCountdownSeconds = Math.floor(perMinuteCountdown % 60);

    return (
        <div>
            <h1>Rate-Limited Promise Execution</h1>
            <p>Pending Promises: {pendingPromisesRef.current}</p>
            <p>Completed Promises: {completedPromises}</p>

            <div>
                <p>
                    Tokens Per Second Remaining: {tokensPerSecondRemaining.toFixed(0)}
                </p>
                <p>
                    Tokens Per Minute Remaining: {tokensPerMinuteRemaining.toFixed(0)}
                </p>
            </div>

            <div>
                <p>
                    Time until next per-second refill:{" "}
                    {perSecondCountdown.toFixed(2)} seconds
                </p>
                <p>
                    Time until next per-minute refill: {perMinuteCountdownMinutes} minutes{" "}
                    {perMinuteCountdownSeconds} seconds
                </p>
            </div>

            <div style={{ marginTop: "20px" }}>
                <progress
                    value={completedPromises}
                    max={totalPromises}
                    style={{ width: "100%", height: "20px" }}
                ></progress>
                <p>{progressPercentage.toFixed(2)}% completed</p>
            </div>
        </div>
    );
}