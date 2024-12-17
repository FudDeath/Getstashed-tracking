/* global BigInt */
import React, { useState, useEffect } from "react";
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

    useEffect(() => {
        const fetchBalance = async () => {
            if (!currentAccount) return;
            
            try {
                const { totalBalance } = await client.getBalance({ 
                    owner: currentAccount.address 
                });
                setBalanceInMist(BigInt(totalBalance));
            } catch (err) {
                console.error("Error fetching balance:", err);
                setError("Failed to fetch balance. Please try again.");
            }
        };

        fetchBalance();
    }, [currentAccount, client]);

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

        if (result?.effects?.created?.length > 0) {
            return result.effects.created.map(obj => obj.objectId);
        }

        // Fallback to checking events if created is not available
        const createdObjects = result?.effects?.events?.filter(event => 
            event.type === "created" || 
            event.newObject || 
            event.moveEvent?.type?.includes("Created")
        );

        console.log("Created objects from events:", createdObjects);
        
        const objectIds = createdObjects?.map(event => 
            event.objectId || event.newObject?.objectId
        ).filter(Boolean) || [];

        return objectIds;
    };

    const formatBalanceInSUI = (balanceInMist) => {
        return (Number(balanceInMist) / Number(ONE_SUI)).toFixed(4);
    };

    const convertSUIToMist = (suiAmount) => {
        return BigInt(Math.floor(suiAmount * Number(ONE_SUI)));
    };

    const createLinks = async () => {
        if (!currentAccount) {
            setError("Please connect your wallet first.");
            return;
        }

        const amountInMist = convertSUIToMist(amountPerLink);
        const linksCount = BigInt(Math.min(numLinks, MAX_LINKS));
        const totalMistNeeded = amountInMist * linksCount;

        if (balanceInMist < totalMistNeeded) {
            setError("Insufficient balance for the requested operation.");
            return;
        }

        setIsLoading(true);
        setError("");

        try {
            const links = Array(numLinks).fill(null).map(() => {
                const link = new ZkSendLinkBuilder({ 
                    sender: currentAccount.address, 
                    client 
                });
                link.addClaimableMist(amountInMist);
                return link;
            });

            const txBlock = await ZkSendLinkBuilder.createLinks({ links });
            console.log("Transaction block:", txBlock);
            
            await signAndExecuteTransaction(
                { transaction: txBlock },
                {
                    onSuccess: (result) => {
                        console.log("Transaction success result:", result);
                        const objectIds = extractObjectIdsFromResult(result);
                        console.log("Extracted object IDs:", objectIds);
                        
                        if (objectIds.length === 0) {
                            console.warn("No object IDs found in transaction result");
                        }
                        
                        setTrackedObjectIds(objectIds);
                        setGeneratedLinks(
                            links.map(link => 
                                link.getLink().replace("zksend.com", "getstashed.com")
                            )
                        );

                        // Refresh balance after successful transaction
                        fetchBalance();
                    },
                    onError: (err) => {
                        console.error("Transaction failed:", err);
                        setError("Transaction failed. Please try again.");
                    }
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
        link.download = `getstashed_links_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md">
                <div className="p-6">
                    <h1 className="text-2xl font-bold mb-6 text-center">
                        GetStashed Bulk Link Generator
                    </h1>

                    <div className="mb-6 flex justify-center">
                        <ConnectButton />
                    </div>

                    {currentAccount && (
                        <div className="mb-6 text-center space-y-2">
                            <p className="text-sm text-gray-600">
                                Connected: 
                                <span className="font-mono ml-2">
                                    {`${currentAccount.address.slice(0, 6)}...${currentAccount.address.slice(-4)}`}
                                </span>
                            </p>
                            <p className="text-sm font-medium">
                                Balance: {formatBalanceInSUI(balanceInMist)} SUI
                            </p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Number of Links (max {MAX_LINKS}):
                            </label>
                            <input
                                type="number"
                                value={numLinks}
                                onChange={handleNumLinksChange}
                                min={1}
                                max={MAX_LINKS}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Amount per Link (SUI):
                            </label>
                            <input
                                type="number"
                                value={amountPerLink}
                                onChange={handleAmountChange}
                                min={MIN_AMOUNT}
                                step={MIN_AMOUNT}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <button
                            onClick={createLinks}
                            disabled={isLoading}
                            className="w-full py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? "Creating..." : "Create Links"}
                        </button>

                        {error && (
                            <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
                                {error}
                            </div>
                        )}

                        {generatedLinks.length > 0 && (
                            <div className="mt-8 space-y-4">
                                <h2 className="text-lg font-semibold">
                                    Generated Links and Objects
                                </h2>
                                <ul className="space-y-4">
                                    {generatedLinks.map((link, index) => (
                                        <li key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div className="flex-1 break-all">
                                                <a
                                                    href={link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-500 hover:underline flex items-center"
                                                >
                                                    {link}
                                                    <ExternalLink className="w-4 h-4 ml-1" />
                                                </a>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    Object ID: {trackedObjectIds[index] || "N/A"}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => copyToClipboard(link)}
                                                className="p-2 text-gray-500 hover:text-gray-700"
                                            >
                                                <Clipboard className="w-4 h-4" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={downloadLinksAndObjects}
                                    className="w-full py-2 px-4 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download Links & Objects
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GetstashedFrontend;
