const express = require('express');
const mysql = require('mysql');
const cors = require('cors');

const app = express();
const PORT = 3005;


// Connexion MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'platforme',
    port: 3307
});

db.connect((err) => {
    if (err) {
        console.log('Erreur de connexion:', err);
        return;
    }
    console.log('Connecté à MySQL !');
});

// ========== 1) Ajouter une matière ==========
app.post('/matiere/add', (req, res) => {
    const { nom } = req.body;

    if (!nom) return res.status(400).json({ error: "Nom obligatoire" });

    const sql = "INSERT INTO matiere (nom) VALUES (?)";

    db.query(sql, [nom], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ message: "Matière ajoutée", id: result.insertId });
    });
});

// ========== 2) Ajouter une séance ==========
app.post('/seance/add', (req, res) => {
    const { id_matiere, id_enseignant, id_groupe, duree, type } = req.body;

    if (!id_matiere || !id_enseignant || !id_groupe)
        return res.status(400).json({ error: "Champs manquants" });

    const sql = `
        INSERT INTO seance (id_matiere, id_enseignant, id_groupe, duree, type)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [id_matiere, id_enseignant, id_groupe, duree, type], (err, result) => {
        if (err) return res.status(500).json({ error: err });

        res.json({ message: "Séance créée", id: result.insertId });
    });
});

// ========== 3) Ajouter un cours dans l'emploi du temps ==========
app.post('/emploi/add', (req, res) => {
    const { id_seance, date_cours, heure_debut, heure_fin, id_salle } = req.body;

    if (!id_seance || !date_cours || !heure_debut || !heure_fin || !id_salle)
        return res.status(400).json({ error: "Champs manquants" });

    // Vérifier conflits : salle
    const sqlSalle = `
        SELECT * FROM emploi_temps
        WHERE id_salle = ? AND date_cours = ?
        AND (heure_debut < ? AND heure_fin > ?)
    `;

    db.query(sqlSalle, [id_salle, date_cours, heure_fin, heure_debut], (err, rowsSalle) => {
        if (err) return res.status(500).json({ error: err });

        if (rowsSalle.length > 0)
            return res.status(409).json({ error: "Conflit : salle occupée" });

        // Récupérer enseignant + groupe de la séance
        const sqlSeance = "SELECT id_enseignant, id_groupe FROM seance WHERE id = ?";
        db.query(sqlSeance, [id_seance], (err, seanceRows) => {
            if (err) return res.status(500).json({ error: err });
            if (seanceRows.length === 0)
                return res.status(404).json({ error: "Séance inexistante" });

            const { id_enseignant, id_groupe } = seanceRows[0];

            // Vérifier conflit enseignant
            const sqlEns = `
                SELECT et.* FROM emploi_temps et
                JOIN seance s ON s.id = et.id_seance
                WHERE s.id_enseignant = ? AND et.date_cours = ?
                AND (et.heure_debut < ? AND et.heure_fin > ?)
            `;
            db.query(sqlEns, [id_enseignant, date_cours, heure_fin, heure_debut], (err, rowsEns) => {
                if (err) return res.status(500).json({ error: err });

                if (rowsEns.length > 0)
                    return res.status(409).json({ error: "Conflit : enseignant occupé" });

                // Vérifier conflit groupe
                const sqlGrp = `
                    SELECT et.* FROM emploi_temps et
                    JOIN seance s ON s.id = et.id_seance
                    WHERE s.id_groupe = ? AND et.date_cours = ?
                    AND (et.heure_debut < ? AND et.heure_fin > ?)
                `;
                db.query(sqlGrp, [id_groupe, date_cours, heure_fin, heure_debut], (err, rowsGrp) => {
                    if (err) return res.status(500).json({ error: err });

                    if (rowsGrp.length > 0)
                        return res.status(409).json({ error: "Conflit : groupe occupé" });

                    // PAS DE CONFLIT → INSÉRER
                    const sqlInsert = `
                        INSERT INTO emploi_temps (id_seance, date_cours, heure_debut, heure_fin, id_salle)
                        VALUES (?, ?, ?, ?, ?)
                    `;

                    db.query(sqlInsert, [id_seance, date_cours, heure_debut, heure_fin, id_salle], (err, result) => {
                        if (err) return res.status(500).json({ error: err });

                        res.json({ message: "Cours planifié avec succès", id: result.insertId });
                    });
                });
            });
        });
    });
});

// ========== 4) Lister emploi du temps ==========
app.get('/emploi/list', (req, res) => {
    const sql = `
        SELECT et.*, m.nom AS matiere, e.firstname, e.lastname, g.nom AS groupe, s.code AS salle
        FROM emploi_temps et
        JOIN seance sc ON et.id_seance = sc.id
        JOIN matiere m ON sc.id_matiere = m.id
        JOIN enseignant e ON sc.id_enseignant = e.id
        JOIN \`groupe\` g ON sc.id_groupe = g.id
        JOIN salle s ON et.id_salle = s.id
        ORDER BY date_cours, heure_debut
    `;

    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err });

        res.json(rows);
    });
});


// Lancer serveur
app.listen(PORT, () => {
    console.log("Serveur lancé sur http://localhost:" + PORT);
});
