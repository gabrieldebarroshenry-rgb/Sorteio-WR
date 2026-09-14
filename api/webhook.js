// api/webhook.js
// O Mercado Pago chama essa URL sozinho assim que um pagamento muda de status.
// Se o pagamento foi aprovado, marcamos o número como "vendido" no Firebase
// automaticamente - sem o Wesley precisar clicar em nada.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDu9cBE5AK7Gsb8gKQEeNxEWj6uicOYBG8",
  authDomain: "rifa-wr.firebaseapp.com",
  projectId: "rifa-wr",
  storageBucket: "rifa-wr.firebasestorage.app",
  messagingSenderId: "604750215640",
  appId: "1:604750215640:web:ce29a0c15aacd46fa29aad"
};

const RAFFLE_DOC_PATH = ['sorteios', 'wrdocorte-1000'];

function getDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
}

export default async function handler(req, res) {
  console.log('Webhook recebido:', JSON.stringify(req.body), JSON.stringify(req.query));

  // O Mercado Pago manda o id do pagamento no corpo ou na query, dependendo do evento
  const paymentId = req.body?.data?.id || req.query['data.id'] || req.query.id;

  if (!paymentId) {
    return res.status(200).send('sem id de pagamento, ignorando');
  }

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const payment = await mpRes.json();

    if (payment.status === 'approved') {
      const number = payment.external_reference;
      const db = getDb();
      const docRef = doc(db, ...RAFFLE_DOC_PATH);
      const snap = await getDoc(docRef);
      const data = snap.exists() ? snap.data() : {};

      if (data[number] && data[number].status !== 'vendido') {
        await setDoc(
          docRef,
          { [number]: { ...data[number], status: 'vendido', confirmedAt: Date.now() } },
          { merge: true }
        );
      }
    }
  } catch (e) {
    console.error('Erro no webhook:', e);
  }

  // Sempre responde 200, senão o Mercado Pago fica tentando de novo
  res.status(200).send('ok');
}
