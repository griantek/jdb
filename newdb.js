import sqlite3 from 'sqlite3';
import fetch from 'node-fetch';
import { URLSearchParams } from 'url';

// API URL for journal search
const apiUrl = "https://api.elsevier.com/content/serial/title";
const apiKey = "718bcc88d9301d08994dfaded3291e39"; // Replace with your API key

// Function to fetch titles from the database
async function fetchTitlesFromDatabase(dbPath = 'scopus_sources.db') {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) reject(`Error opening database: ${err.message}`);
        });

        const query = 'SELECT source_title FROM sources';

        db.all(query, [], (err, rows) => {
            if (err) reject(`Error fetching titles: ${err.message}`);
            resolve(rows.map(row => row.source_title));
            db.close();
        });
    });
}

// Function to fetch journal details from the API
async function fetchJournalDetails(title) {
    const params = new URLSearchParams({
        title,
        apiKey,
        view: "STANDARD"
    });

    try {
        const response = await fetch(`${apiUrl}?${params}`, {
            headers: { "Accept": "application/json" }
        });

        if (response.ok) {
            const data = await response.json();
            const journals = data["serial-metadata-response"].entry;

            if (journals && journals.length > 0) {
                const journal = journals[0]; // Assume the first result is the most relevant
                const citeScoreYearInfo = journal["citeScoreYearInfoList"];
                const citeScore = citeScoreYearInfo?.["citeScoreCurrentMetric"] || "N/A";
                const sourceLink = journal.link.find(link => link["@ref"] === "scopus-source")?.["@href"] || "N/A";

                return { title, citeScore, sourceLink };
            }
        } else {
            console.error(`Error: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error(`Error fetching details for ${title}:`, error);
    }

    return { title, citeScore: "N/A", sourceLink: "N/A" };
}

// Function to store journal details in a database
async function storeJournalDetails(journals, dbPath = 'journal_details.db') {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) reject(`Error opening database: ${err.message}`);
        });

        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS journal_details (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                citeScore TEXT,
                sourceLink TEXT
            )
        `;

        db.run(createTableQuery, (err) => {
            if (err) reject(`Error creating table: ${err.message}`);

            const insertQuery = `
                INSERT INTO journal_details (title, citeScore, sourceLink)
                VALUES (?, ?, ?)
            `;

            const stmt = db.prepare(insertQuery);

            journals.forEach(({ title, citeScore, sourceLink }) => {
                stmt.run([title, citeScore, sourceLink]);
            });

            stmt.finalize((err) => {
                if (err) reject(`Error finalizing statement: ${err.message}`);
                resolve("Journal details stored successfully.");
                db.close();
            });
        });
    });
}

// Main function to fetch titles, retrieve details, and store in a database
async function main() {
    try {
        const titles = await fetchTitlesFromDatabase();
        const journalDetails = [];

        for (const title of titles) {
            console.log(`Fetching details for: ${title}`);
            const details = await fetchJournalDetails(title);
            journalDetails.push(details);
        }

        await storeJournalDetails(journalDetails);
        console.log("All journal details have been fetched and stored successfully.");
    } catch (error) {
        console.error("Error in main process:", error);
    }
}

// Start the program
main();
