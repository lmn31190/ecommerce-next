import { v2 as cloudinary } from "cloudinary";
import { getAuth } from '@clerk/nextjs/server';
import authSeller from "@/lib/authSeller";
import { NextResponse } from "next/server";
import connectDB from "@/config/db";
import Product from "@/models/Product";

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

export async function POST(request) {
    try {
        console.log("⏳ Début de l’upload produit");

        const { userId } = getAuth(request);
        console.log("🔑 Authentification utilisateur :", userId);

        const isSeller = await authSeller(userId);
        console.log("🛒 Vérification vendeur :", isSeller);

        if (!isSeller) {
            console.warn("⚠️ Accès refusé : utilisateur non vendeur");
            return NextResponse.json({ success: false, message: 'not authorized' });
        }

        const formData = await request.formData();
        console.log("📦 formData reçu");

        const name = formData.get('name');
        const description = formData.get('description');
        const category = formData.get('category');
        const price = formData.get('price');
        const offerPrice = formData.get('offerPrice');
        const files = formData.getAll('images');

        console.log("📄 Données reçues :", { name, description, category, price, offerPrice });
        console.log("📸 Nombre de fichiers :", files.length);

        if (!files || files.length === 0) {
            console.warn("⚠️ Aucun fichier envoyé");
            return NextResponse.json({ success: false, message: 'no files uploaded' });
        }

        const result = await Promise.all(
            files.map(async (file, i) => {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                console.log(`⬆️ Upload image ${i + 1}/${files.length} vers Cloudinary`);

                return new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { resource_type: 'auto' },
                        (error, result) => {
                            if (error) {
                                console.error(`❌ Erreur upload Cloudinary (image ${i + 1}):`, error);
                                reject(error);
                            } else {
                                console.log(`✅ Image ${i + 1} uploadée :`, result.secure_url);
                                resolve(result);
                            }
                        }
                    );
                    stream.end(buffer);
                });
            })
        );

        const image = result.map(res => res.secure_url);

        await connectDB();
        console.log("✅ Connexion DB établie");

        const newProduct = await Product.create({
            userId,
            name,
            description,
            category,
            price: Number(price),
            offerPrice: Number(offerPrice),
            image,
            date: Date.now()
        });

        console.log("🆕 Produit créé :", newProduct._id);

        return NextResponse.json({ success: true, message: 'Upload successful', newProduct });

    } catch (error) {
        console.error("🔥 Erreur serveur :", error);
        return NextResponse.json({ success: false, message: error.message || "Internal Server Error" });
    }
}
