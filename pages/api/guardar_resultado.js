// pages/api/guardar_resultado.js

import mongoose from 'mongoose';

// Conexión a MongoDB usando la variable de entorno
const uri = process.env.MONGODB_URI;

// --- Definición del Modelo de Datos ---
const ResultadoSchema = new mongoose.Schema({
    uniqueId: { type: String, required: true, unique: true, index: true },
    timestamp: { type: Date, default: Date.now },
    puntuacion: { type: Number, required: true },
    respuestas: { type: Object, required: true }, // Respuestas del usuario
    totalPreguntas: { type: Number, required: true },
    examen: { type: Array, required: true } // Almacenamos el examen completo (preguntas/opciones/correctas)
});

// Obtener el Modelo si ya existe o crearlo
const Resultado = mongoose.models.Resultado || mongoose.model('Resultado', ResultadoSchema);

// Función de Conexión (Esencial en Serverless para reutilizar la conexión)
const connectToDatabase = async () => {
    if (mongoose.connections[0].readyState) return;
    try {
        await mongoose.connect(uri);
    } catch (error) {
        console.error("Error al conectar a MongoDB:", error);
        throw new Error("No se pudo conectar a la base de datos.");
    }
};

// Generador de ID único (ej. R_ABC123)
const generateUniqueId = () => 'R_' + Math.random().toString(36).substring(2, 8).toUpperCase();


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Solo se permiten peticiones POST.' });
    }

    try {
        await connectToDatabase();

        // Recibimos la puntuación, el examen y las respuestas del frontend
        const { puntuacion, respuestas, totalPreguntas, examen } = req.body;
        
        if (!puntuacion || !respuestas || !totalPreguntas || !examen) {
            return res.status(400).json({ error: 'Faltan datos de resultados para guardar.' });
        }

        const uniqueId = generateUniqueId();

        const newResultado = new Resultado({
            uniqueId,
            puntuacion,
            respuestas,
            totalPreguntas,
            examen,
        });

        await newResultado.save();

        // Devolvemos el ID único que el Frontend usará para formar el enlace
        return res.status(201).json({ success: true, shareId: uniqueId });

    } catch (error) {
        console.error('Error al guardar el resultado:', error);
        return res.status(500).json({ error: 'Error interno del servidor al guardar el resultado.', details: error.message });
    }
}