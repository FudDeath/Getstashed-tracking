/* global BigInt */
import React, { useState, useEffect, useCallback } from "react";
import { ZkSendLinkBuilder } from "@mysten/zksend";
import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Download, Clipboard, ExternalLink } from "lucide-react";

const ONE_SUI = BigInt(1000000000);
const MAX_LINKS = 100;
const MIN_AMOUNT = 0.1;

const GetstashedFrontend = () => {
    const [numLinks, setNumLinks] = useState(1);
    const [amountPerLink, setAmountPerLink] = useState(MIN_AMOUNT);
    const [generatedLinks, setGeneratedLinks] = useState([]);
    const [trackedObjectIds, setTrackedObjectIds] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [balanceInMist, setBalanceInMist] = useState(BigInt(0));

    const currentAccount = useCurrentAccount();
    const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

    const fetchBalance = useCallback(async () => {
        if (!currentAccount) return;

        try {
            const { totalBalance } = await client.getBalance({ owner: currentAccount.address });
            setBalanceInMist(BigInt(totalBalance));
        } catch (err) {
            console.error("Error fetching balance:", err);
            setError("Failed to fetch balance. Please try again.");
        }
    }, [currentAccount, client]);

    useEffect(() => {
        fetchBalance();
    }, [fetchBalance]);

    const handleNumLinksChange = (e) => {
        const value = parseInt(e.target.value) || 1;
        setNumLinks(Math.min(Math.max(1, value), MAX_LINKS));
    };

    const handleAmountChange = (e) => {
        const value = parseFloat(e.target.value) || MIN_AMOUNT;
        setAmountPerLink(Math.max(MIN_AMOUNT, value));
    };

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const extractObjectIdsFromResult = (result) => {
        console.log("Transaction result:", result);

        const objectIds = [];

        // Extract from 'created' field
        if (result?.effects?.created?.length > 0) {
            result.effects.created.forEach((item) => {
                if (item.reference?.objectId) {
                    objectIds.push(item.reference.objectId);
                }
            });
        }

        // Fallback to events if 'created' is empty
        const events = result?.effects?.events || [];
        events.forEach((event) => {
            if (event.newObject?.objectId) {
                objectIds.push(event.newObject.objectId);
            } else if (event.moveEvent?.fields?.object_id) {
                objectIds.push(event.moveEvent.fields.object_id);
            }
        });

        console.log("Extracted Object IDs:", objectIds);
        return objectIds;
    };

    const createLinks = async () => {
        if (!currentAccount) {
            setError("Please connect your wallet first.");
            return;
        }

        const amountInMist = BigInt(Math.floor(amountPerLink * Number(ONE_SUI)));
        const linksCount = Math.min(numLinks, MAX_LINKS);
        const totalMistNeeded = amountInMist * BigInt(linksCount);

        if (balanceInMist < totalMistNeeded) {
            setError("Insufficient balance for the requested operation.");
            return;
        }

        setIsLoading(true);
        setError("");

        try {
            const links = Array(linksCount)
                .fill(null)
                .map(() => {
                    const link = new ZkSendLinkBuilder({ sender: currentAccount.address, client });
                    link.addClaimableMist(amountInMist);
                    return link;
                });

            const txBlock = await ZkSendLinkBuilder.createLinks({ links });
            console.log("Transaction block:", txBlock);

            await signAndExecuteTransaction(
                { transaction: txBlock, options: { showObjectChanges: true } },
                {
                    onSuccess: async (result) => {
                        console.log("Transaction success result:", result);
                        const objectIds = extractObjectIdsFromResult(result);
                        setTrackedObjectIds(objectIds);
                        setGeneratedLinks(
                            links.map((link) =>
                                link.getLink().replace("zksend.com", "getstashed.com")
                            )
                        );
                        await fetchBalance();
                    },
                    onError: (err) => {
                        console.error("Transaction failed:", err);
                        setError("Transaction failed. Please try again.");
                    },
                }
            );
        } catch (err) {
            console.error("Error creating links:", err);
            setError("Failed to create links. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const downloadLinksAndObjects = () => {
        const data = generatedLinks
            .map((link, index) =>
                `Link: ${link}\nObject ID: ${trackedObjectIds[index] || "N/A"}\n`
            )
            .join("\n");

        const blob = new Blob([data], { type: "text/plain" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `getstashed_links_${new Date().toISOString().split("T")[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center">GetStashed Bulk Link Generator</h1>

                <div className="mb-6 flex justify-center">
                    <ConnectButton />
                </div>

                {currentAccount && (
                    <div className="text-center mb-4">
                        <p>Connected: {currentAccount.address}</p>
                        <p>Balance: {(Number(balanceInMist) / Number(ONE_SUI)).toFixed(4)} SUI</p>
                    </div>
                )}

                <div>
                    <label>Number of Links:</label>
                    <input type="number" value={numLinks} onChange={handleNumLinksChange} min={1} max={MAX_LINKS} />
                    <label>Amount per Link (SUI):</label>
                    <input type="number" value={amountPerLink} onChange={handleAmountChange} step={0.1} min={MIN_AMOUNT} />
                </div>

                <button onClick={createLinks} disabled={isLoading}>
                    {isLoading ? "Creating..." : "Create Links"}
                </button>

                {generatedLinks.length > 0 && (
                    <div>
                        <h2>Generated Links and Objects</h2>
                        <ul>
                            {generatedLinks.map((link, index) => (
                                <li key={index}>
                                    <a href={link} target="_blank" rel="noopener noreferrer">
                                        {link}
                                    </a>{" "}
                                    - Object ID: {trackedObjectIds[index] || "N/A"}
                                </li>
                            ))}
                        </ul>
                        <button onClick={downloadLinksAndObjects}>Download Links & Objects</button>
                    </div>
                )}

                {error && <p className="text-red-500 mt-4">{error}</p>}
            </div>
        </div>
    );
};

export default GetstashedFrontend;
