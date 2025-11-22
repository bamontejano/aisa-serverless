// pages/api/generar_examen.js

// Importaciones de Node.js:
import fs from 'fs';
import { promisify } from 'util';
import path from 'path';

// Importaciones de Google:
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleGenAI } from '@google/genai';

// Importación para manejar archivos multipart/form-data:
import formidable from 'formidable';

// ------------------------------------------------------------------
// Configuraciones y Inicialización de Clientes
// ------------------------------------------------------------------

// 1. Cliente Gemini: (CORRECCIÓN FINAL)
// Usamos la clave de la variable GEMINI_API_KEY. Forzamos la autenticación solo con la API Key 
// para evitar conflictos de "scopes" con las credenciales de Vision.
const gemini = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY, 
    auth: {
        apiKey: process.env.GEMINI_API_KEY,
    }
});

// 2. Cliente Vision: (CORRECCIÓN FINAL PARA VERCEL)
// Lee el contenido de la clave JSON de la variable de entorno VISION_KEY_JSON.
// Esto es necesario porque Vercel no permite subir el archivo vision-key.json.
const visionClient = new ImageAnnotatorClient({
    credentials: JSON.parse(process.env.VISION_KEY_JSON), 
}); 

// Desactivamos la configuración del cuerpo por defecto de Next.js
export const config = {
    api: {
        bodyParser: false,
    },
};

// ------------------------------------------------------------------
// Función Auxiliar para Parsear el Archivo (multipart/form-data)
// ------------------------------------------------------------------
const parseForm = (req) => {
    return new Promise((resolve, reject) => {
        const form = formidable({ 
            multiples: false,
            // Usamos '/tmp' en producción Vercel, pero 'temp' en local
            uploadDir: process.env.NODE_ENV === 'production' ? '/tmp' : path.join(process.cwd(), 'temp'), 
            maxFileSize: 5 * 1024 * 1024, // 5MB
        });

        const tempDir = form.options.uploadDir;
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        form.parse(req, (err, fields, files) => {
            if (err) return reject(err);
            
            // Convertir 'fields' y 'files' de arrays a objetos simples
            const simpleFields = Object.fromEntries(
                Object.entries(fields).map(([key, value]) => [key, value[0]])
            );
            const simpleFiles = Object.fromEntries(
                Object.entries(files).map(([key, value]) => [key, value[0]])
            );

            resolve({ fields: simpleFields, files: simpleFiles });
        });
    });
};

// ------------------------------------------------------------------
// Lógica Principal de la Serverless Function
// ------------------------------------------------------------------

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Solo se permiten peticiones POST.' });
    }

    let filePath = null;

    try {
        // 1. Parsear la petición multipart/form-data
        const { fields, files } = await parseForm(req);
        
        const file = files.file; 

        if (!file) {
             return res.status(400).json({ error: 'No se proporcionó un archivo bajo la clave "file".' });
        }

        filePath = file.filepath;

        const examType = fields.exam_type || '5 preguntas de opción múltiple';

        // 2. Leer el contenido del archivo subido (Binario)
        const imageContent = fs.readFileSync(filePath);

        // 3. Procesamiento OCR (Cloud Vision)
        const [result] = await visionClient.documentTextDetection(imageContent);
        const studyText = result.fullTextAnnotation?.text;

        if (!studyText || studyText.length < 50) {
            return res.status(500).json({ error: 'OCR falló: No se pudo extraer suficiente texto (mínimo 50 caracteres).' });
        }

        // 4. Generación de Examen (Gemini)
        const prompt = `
        Eres AISA, un asistente de estudio experto en generar exámenes. Genera un examen de '${examType}' basado exclusivamente en el 'MATERIAL DE ESTUDIO' provisto. 
        
        FORMATO DE SALIDA: La respuesta debe ser un objeto JSON que contenga una lista llamada 'preguntas'. Cada pregunta debe tener: 'id', 'pregunta', 'tipo', 'opciones' (si aplica), y 'respuesta_correcta'.
        
        MATERIAL DE ESTUDIO: 
        ---
        ${studyText}
        ---
        `;
        
        const response = await gemini.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
            },
        });

        const examJson = JSON.parse(response.text);

        // 5. Respuesta Exitosa
        return res.status(200).json({
            status: 'Examen generado exitosamente (Serverless)',
            tipo_solicitado: examType,
            examen: examJson,
        });

    } catch (error) {
        console.error('Error en Serverless Function:', error);
        return res.status(500).json({ 
            error: 'Error interno del servidor Serverless durante el proceso.', 
            details: error.message 
        });

    } finally {
        // 6. Limpieza: Eliminar el archivo temporal
        if (filePath) {
            try {
                fs.unlinkSync(filePath); 
            } catch (err) {
                console.error('Error al limpiar el archivo temporal:', err);
            }
        }
    }
}