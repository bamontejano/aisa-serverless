// pages/api/obtener_resultado.js

import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;

// --- Definición del Modelo (Mismo que el de guardado) ---
// Es crucial que la definición del esquema sea idéntica a la de 'guardar_resultado.js'
const ResultadoSchema = new mongoose.Schema({
    uniqueId: { type: String, required: true, unique: true, index: true },
    timestamp: { type: Date, default: Date.now },
    puntuacion: { type: Number, required: true },
    respuestas: { type: Object, required: true },
    totalPreguntas: { type: Number, required: true },
    examen: { type: Array, required: true } 
});

const Resultado = mongoose.models.Resultado || mongoose.model('Resultado', ResultadoSchema);

// Función de Conexión (Esencial en Serverless)
const connectToDatabase = async () => {
    if (mongoose.connections[0].readyState) return;
    await mongoose.connect(uri);
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Solo se permiten peticiones GET.' });
    }

    // 1. Obtener el ID de la URL (query parameter)
    const { shareId } = req.query; 

    if (!shareId) {
        return res.status(400).json({ error: 'Falta el parámetro shareId.' });
    }

    try {
        await connectToDatabase();

        // 2. Buscar el documento en MongoDB
        const resultado = await Resultado.findOne({ uniqueId: shareId }).lean(); // .lean() para obtener un objeto JS plano

        if (!resultado) {
            return res.status(404).json({ error: 'Resultado de examen no encontrado.' });
        }

        // 3. Devolver los resultados encontrados
        return res.status(200).json({ success: true, resultado });

    } catch (error) {
        console.error('Error al obtener el resultado:', error);
        return res.status(500).json({ error: 'Error interno del servidor al obtener el resultado.', details: error.message });
    }
}