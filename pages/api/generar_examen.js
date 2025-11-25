**
 * Endpoint de API de Vercel/Node.js para generar un examen.
 * * Este endpoint maneja la carga de múltiples archivos de imagen, los codifica en base64,
 * los envía al modelo Gemini junto con el prompt del usuario (tipo de examen),
 * y devuelve el examen generado en formato JSON estructurado.
 */

// Importación para manejar el formulario multipart (archivos)
import formidable from 'formidable';
// Importación de la librería de Google AI
import { GoogleGenAI } from '@google/genai';
// Importación del módulo 'fs' para la lectura de archivos (en caso de pruebas locales o manejo avanzado)
import * as fs from 'fs/promises';

// Crea una instancia de GoogleGenAI. 
// La clave de API se obtiene automáticamente de la variable de entorno GEMINI_API_KEY en Vercel.
const ai = new GoogleGenAI({});

// Utilidad para convertir el buffer de un archivo a un objeto Part para el modelo Gemini
function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    },
  };
}

// Deshabilita el parser de cuerpo de Next.js/Vercel por defecto para usar 'formidable'
// Esto es necesario para manejar archivos cargados (multipart/form-data).
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        // 1. Parsear los datos del formulario (archivos e información)
        const form = formidable({});

        const { fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    console.error("Error al parsear el formulario:", err);
                    return reject(err);
                }
                // Las 'fields' y 'files' devueltas por formidable son arreglos, 
                // por lo que las aplanamos o accedemos al primer elemento.
                const flatFields = {};
                for (const key in fields) {
                    flatFields[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
                }
                resolve({ fields: flatFields, files });
            });
        });

        // 2. Extraer parámetros
        const examType = fields.exam_type || '5 preguntas de opción múltiple';
        const fileList = files.files || []; // 'files' debe coincidir con formData.append('files', file) en el frontend
        
        // Convertir fileList a un array si no lo es (caso de un solo archivo)
        const inputFiles = Array.isArray(fileList) ? fileList : [fileList];

        if (inputFiles.length === 0) {
            return res.status(400).json({ error: "No se encontraron archivos de material de estudio." });
        }

        // 3. Preparar las partes del modelo (imágenes y texto)
        const imageParts = [];
        for (const file of inputFiles) {
             // Asegurarse de que el archivo existe y es válido
            if (file && file.filepath && file.mimetype) {
                const buffer = await fs.readFile(file.filepath);
                imageParts.push(fileToGenerativePart(buffer, file.mimetype));
            }
        }
        
        // Prompt del sistema para guiar a la IA
        const systemInstruction = {
            parts: [{
                text: "Eres AISA, un sistema de generación de exámenes basado en IA. Tu tarea es analizar las imágenes proporcionadas (material de estudio) y crear un examen estructurado en formato JSON. El JSON debe ser *estrictamente* un objeto con una clave 'preguntas', que es un array de objetos. Céntrate únicamente en el contenido académico de las imágenes."
            }]
        };

        // Prompt del usuario (solicitud)
        const userPrompt = `Basado en el material de estudio adjunto, genera un examen con ${examType}. El examen debe tener preguntas de opción múltiple.
        
        Sigue estrictamente la siguiente estructura de respuesta en JSON. No incluyas ningún texto explicativo, encabezado o Markdown fuera del bloque JSON.

        JSON_SCHEMA: 
        {
          "preguntas": [
            {
              "id": "q1", // Identificador único de la pregunta (q1, q2, ...)
              "pregunta": "Texto de la pregunta.",
              "opciones": {
                "a": "Opción A",
                "b": "Opción B",
                "c": "Opción C",
                "d": "Opción D"
              },
              "respuesta_correcta": "a" // La clave de la opción correcta (a, b, c, o d)
            },
            // ... más preguntas
          ]
        }`;

        // Contenido completo para el modelo (imágenes + texto)
        const modelContents = [
            ...imageParts,
            { text: userPrompt }
        ];

        // 4. Llamar al modelo Gemini
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-09-2025",
            contents: modelContents,
            config: {
                 // Configurar el modelo para que devuelva un JSON válido.
                responseMimeType: "application/json",
            },
            systemInstruction
        });

        // 5. Procesar la respuesta
        const jsonText = response.text.trim();
        
        // Intentar parsear el JSON
        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonText);
        } catch (e) {
            console.error("Error al parsear la respuesta JSON del modelo:", e, "Texto recibido:", jsonText);
            return res.status(500).json({ error: "La IA devolvió un formato inválido. Reintenta.", details: jsonText });
        }

        // 6. Enviar respuesta final
        res.status(200).json({ 
            message: "Examen generado exitosamente.", 
            examen: parsedJson 
        });

    } catch (error) {
        console.error("Error en la función handler:", error);
        res.status(500).json({ error: "Error interno del servidor. Verifique la clave API o el formato de la solicitud.", details: error.message });
    }
}