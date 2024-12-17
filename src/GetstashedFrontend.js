/* global BigInt */
import React, { useState, useEffect } from "react";
import { ZkSendLinkBuilder, ZkSendLink } from "@mysten/zksend";
import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import {
    ConnectButton,
    useCurrentAccount,
    useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { ClipboardIcon, DownloadIcon } from "lucide-react";
import "./styles.css";

const ONE_SUI = BigInt(1000000000);
const MAX_LINKS = 100;

const GetstashedFrontend = () => {
    const [numLinks, setNumLinks] = useState(1);
    const [amountPerLink, setAmountPerLink] = useState(0.1);
    const [generatedLinks, setGeneratedLinks] = useState([]);
    const [trackedObjectIds, setTrackedObjectIds] = useState([]);
    const [objectOwners, setObjectOwners] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingOwners, setIsFetchingOwners] = useState(false);
    const [error, setError] = useState("");
    const [balance, setBalance] = useState(null);

    const currentAccount = useCurrentAccount();
    const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

    // Fetch balance on load or wallet change
    useEffect(() => {
        const fetchBalance = async () => {
            if (currentAccount) {
                try {
                    const { totalBalance } = await client.getBalance({
                        owner: currentAccount.address,
                    });
                    setBalance(Number(totalBalance) / Number(ONE_SUI));
                } catch (error) {
                    console.error("Error fetching balance:", error);
                    setError("Failed to fetch balance.");
                }
            } else setBalance(null);
        };
        fetchBalance();
    }, [currentAccount, client]);

    const refreshBalance = async () => {
        if (currentAccount) {
            try {
                const { totalBalance } = await client.getBalance({
                    owner: currentAccount.address,
                });
                setBalance(Number(totalBalance) / Number(ONE_SUI));
            } catch (error) {
                console.error("Error refreshing balance:", error);
            }
        }
    };

    const createLinks = async () => {
        if (!currentAccount) {
            setError("Please connect your wallet first.");
            return;
        }

        const numLinksToCreate = Math.min(numLinks, MAX_LINKS);
        const totalSuiNeeded =
            BigInt(Math.floor(amountPerLink * Number(ONE_SUI))) *
            BigInt(numLinksToCreate);

        if (BigInt(Math.floor(Number(balance) * Number(ONE_SUI))) < totalSuiNeeded) {
            setError("Insufficient balance.");
            return;
        }

        setIsLoading(true);
        setError("");
        try {
            const links = [];
            for (let i = 0; i < numLinksToCreate; i++) {
                const link = new ZkSendLinkBuilder({
                    sender: currentAccount.address,
                    client,
                });
                link.addClaimableMist(BigInt(Math.floor(amountPerLink * Number(ONE_SUI))));
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
                            links.map((link) =>
                                link.getLink().replace("zksend.com", "getstashed.com")
                            )
                        );
                        await refreshBalance();
                    },
                    onError: (err) => {
                        console.error("Error executing transaction:", err);
                        setError("An error occurred while creating links.");
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

    const fetchObjectOwners = async () => {
        if (!trackedObjectIds.length) {
            setError("No objects are being tracked.");
            return;
        }

        setIsFetchingOwners(true);
        setError("");
        const ownerDetails = [];
        try {
            for (const objectId of trackedObjectIds) {
                const objectInfo = await client.getObject({
                    id: objectId,
                    options: { showOwner: true },
                });
                const owner = objectInfo?.data?.owner || "Unknown";
                ownerDetails.push({ objectId, owner });
            }
            setObjectOwners(ownerDetails);
        } catch (error) {
            console.error("Error fetching object owners:", error);
            setError("An error occurred while fetching object owners.");
        } finally {
            setIsFetchingOwners(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6">
                <h1 className="text-2xl font-bold mb-6 text-center">
                    GetStashed Bulk Link Generator
                </h1>

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
                    />
                </div>
                <div>
                    <label>Amount per Link (in SUI):</label>
                    <input
                        type="number"
                        value={amountPerLink}
                        onChange={(e) => setAmountPerLink(parseFloat(e.target.value) || 0)}
                        step="0.1"
                    />
                </div>
                <button onClick={createLinks}>
                    {isLoading ? "Creating..." : "Create Links"}
                </button>

                <h2>Tracked Object Owners</h2>
                <button onClick={fetchObjectOwners} disabled={isFetchingOwners}>
                    {isFetchingOwners ? "Fetching Owners..." : "Fetch Object Owners"}
                </button>
                {objectOwners.map(({ objectId, owner }) => (
                    <div key={objectId}>
                        Object ID: {objectId} - Owner: {owner}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GetstashedFrontend;
