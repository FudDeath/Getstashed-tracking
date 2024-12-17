/* global BigInt */
import React, { useState, useEffect } from "react";
import { ZkSendLinkBuilder } from "@mysten/zksend";
import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { ClipboardIcon, DownloadIcon } from "lucide-react";
import "./styles.css";

const ONE_SUI = BigInt(1000000000);
const MAX_LINKS = 100;

const GetstashedFrontend = () => {
    const [numLinks, setNumLinks] = useState(1);
    const [amountPerLink, setAmountPerLink] = useState(0.1);
    const [generatedLinks, setGeneratedLinks] = useState([]);
    const [trackedObjectIds, setTrackedObjectIds] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [balance, setBalance] = useState(null);

    const currentAccount = useCurrentAccount();
    const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

    useEffect(() => {
        const fetchBalance = async () => {
            if (currentAccount) {
                try {
                    const { totalBalance } = await client.getBalance({ owner: currentAccount.address });
                    setBalance(Number(totalBalance) / Number(ONE_SUI));
                } catch (error) {
                    console.error("Error fetching balance:", error);
                    setError("Failed to fetch balance.");
                }
            }
        };
        fetchBalance();
    }, [currentAccount]);

    const createLinks = async () => {
        if (!currentAccount) {
            setError("Please connect your wallet first.");
            return;
        }

        const totalSuiNeeded =
            BigInt(Math.floor(amountPerLink * Number(ONE_SUI))) * BigInt(Math.min(numLinks, MAX_LINKS));

        if (balance * ONE_SUI < totalSuiNeeded) {
            setError("Insufficient balance.");
            return;
        }

        setIsLoading(true);
        setError("");

        try {
            const links = [];
            for (let i = 0; i < numLinks; i++) {
                const link = new ZkSendLinkBuilder({ sender: currentAccount.address, client });
                link.addClaimableMist(BigInt(amountPerLink * Number(ONE_SUI)));
                links.push(link);
            }

            const txBlock = await ZkSendLinkBuilder.createLinks({ links });
            await signAndExecuteTransaction(
                { transaction: txBlock },
                {
                    onSuccess: async (result) => {
                        console.log("Transaction successful", result);
                        const objectIds = extractObjectIdsFromResult(result);
                        setTrackedObjectIds(objectIds);
                        setGeneratedLinks(
                            links.map((link) => link.getLink().replace("zksend.com", "getstashed.com"))
                        );
                    },
                }
            );
        } catch (error) {
            console.error("Error creating links:", error);
            setError("An error occurred while creating links.");
        } finally {
            setIsLoading(false);
        }
    };

    const extractObjectIdsFromResult = (result) => {
        const objectIds = [];
        const events = result?.effects?.events || [];
        for (const event of events) {
            if (event.newObject) objectIds.push(event.newObject.objectId);
        }
        return objectIds;
    };

    const downloadLinksAndObjects = () => {
        const data = generatedLinks
            .map((link, index) => `Link: ${link}, Object ID: ${trackedObjectIds[index] || "N/A"}`)
            .join("\n");

        const blob = new Blob([data], { type: "text/plain" });
        const url = URL.createObjectURL(blob);

        const element = document.createElement("a");
        element.href = url;
        element.download = "links_and_objects.txt";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center">GetStashed Bulk Link Generator</h1>

                <div className="mb-6 flex justify-center">
                    <ConnectButton />
                </div>

                {currentAccount && (
                    <div className="mb-6 text-center">
                        <p>
                            Connected:{" "}
                            <strong>
                                0x{currentAccount.address.slice(2, 6)}...
                                {currentAccount.address.slice(-4)}
                            </strong>
                        </p>
                        <p>Balance: {balance ? `${balance.toFixed(4)} SUI` : "Loading..."}</p>
                    </div>
                )}

                <div>
                    <label>Number of Links (max 100):</label>
                    <input
                        type="number"
                        value={numLinks}
                        onChange={(e) => setNumLinks(Math.min(parseInt(e.target.value) || 1, MAX_LINKS))}
                        className="mt-1 w-full rounded border p-2"
                    />
                </div>
                <div>
                    <label>Amount per Link (in SUI):</label>
                    <input
                        type="number"
                        value={amountPerLink}
                        onChange={(e) => setAmountPerLink(parseFloat(e.target.value) || 0)}
                        step="0.1"
                        className="mt-1 w-full rounded border p-2"
                    />
                </div>

                <button
                    onClick={createLinks}
                    disabled={isLoading}
                    className="w-full mt-4 bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
                >
                    {isLoading ? "Creating..." : "Create Links"}
                </button>

                {error && <p className="mt-2 text-red-500">{error}</p>}

                {generatedLinks.length > 0 && (
                    <div className="mt-8">
                        <h2 className="text-lg font-semibold">Generated Links and Objects</h2>
                        <ul className="list-disc pl-5">
                            {generatedLinks.map((link, index) => (
                                <li key={index}>
                                    Link:{" "}
                                    <a
                                        href={link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-500 underline"
                                    >
                                        {link}
                                    </a>
                                    <br />
                                    Object ID: {trackedObjectIds[index] || "N/A"}
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={downloadLinksAndObjects}
                            className="mt-4 flex items-center bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600"
                        >
                            <DownloadIcon className="w-5 h-5 mr-2" /> Download Links & Objects
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GetstashedFrontend;
