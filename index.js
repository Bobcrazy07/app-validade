// 1. Carrega as variáveis do arquivo .env
require('dotenv').config(); 

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();
// O Render vai nos dar uma porta automaticamente, ou usamos a 3000 localmente
const port = process.env.PORT || 3000; 

// --- CREDENCIAIS (Agora vêm do .env ou do Render) ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Verifica se as chaves existem (Segurança)
if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_API_KEY) {
    console.error("ERRO: Faltam variáveis de ambiente (.env)");
    process.exit(1); // Mata o servidor se não tiver chaves
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const resend = new Resend(RESEND_API_KEY);

// ... (O RESTO DO CÓDIGO CONTINUA IGUAL ABAIXO) ...--------------------

app.use(cors());
app.use(express.json()); // Middleware para entender JSON

app.get('/send-alerts', async (req, res) => {
    console.log('Recebida requisição para checar alertas...');

    try {
        // ... dentro de app.get('/send-alerts', ...)

        // 1. CALCULAR A DATA-ALVO (MODO CORRIGIDO)
        const hoje = new Date();
        const dataAlvo = new Date(hoje);
        dataAlvo.setDate(hoje.getDate() + 7); // Adiciona 7 dias

        // Formata a data para 'AAAA-MM-DD' manualmente, ignorando fuso
        const ano = dataAlvo.getFullYear();
        const mes = String(dataAlvo.getMonth() + 1).padStart(2, '0'); // Mês é 0-indexado
        const dia = String(dataAlvo.getDate()).padStart(2, '0');

        const dataAlvoString = `${ano}-${mes}-${dia}`; // Formato 'YYYY-MM-DD'

        console.log('Procurando produtos que vencem em:', dataAlvoString);

        // 2. BUSCAR PRODUTOS NO SUPABASE
        // .eq() significa "equals" (igual a)
        const { data: produtos, error: dbError } = await supabase
            .from('produtos')
            .select('nome, data_validade') // Pega só o nome e a data
            .eq('data_validade', dataAlvoString);

        if (dbError) {
            throw new Error(`Erro no Supabase: ${dbError.message}`);
        }

        if (!produtos || produtos.length === 0) {
            console.log('Nenhum produto vencendo hoje.');
            return res.json({ mensagem: 'Nenhum produto vencendo na data-alvo.' });
        }

        console.log(`Encontrados ${produtos.length} produtos. Disparando emails...`);

        // 3. ENVIAR EMAIL(s) PARA CADA PRODUTO
        // (Vamos agrupar todos em um email só)

        let listaProdutosEmail = '<ul>';
        produtos.forEach(p => {
            listaProdutosEmail += `<li>${p.nome}</li>`;
        });
        listaProdutosEmail += '</ul>';

        const { data, error: emailError } = await resend.emails.send({
            from: 'onboarding@resend.dev', // Email do Sandbox do Resend (ou seu domínio verificado)
            to: ['andre.vilela07@gmail.com'],  // <-- MUDE AQUI: Seu email pessoal
            subject: `Alerta de Validade - ${produtos.length} produtos!`,
            html: `
                <p>Olá!</p>
                <p>Os seguintes produtos estão vencendo em 7 dias (${dataAlvoString}):</p>
                ${listaProdutosEmail}
            `
        });

        if (emailError) {
            throw new Error(`Erro no Resend: ${emailError.message}`);
        }

        console.log('Emails enviados com sucesso!', data);
        res.json({ mensagem: 'Alertas processados e emails enviados!', produtos: produtos });

    } catch (error) {
        console.error('Erro geral ao processar alertas:', error);
        res.status(500).json({ erro: error.message });
    }
});


// Iniciar o servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
    console.log('Conectado ao Supabase!');
    console.log('CORS habilitado.');
});
// --- NOSSAS ROTAS (ENDPOINTS) ---

// [LER] GET /produtos - Listar todos os produtos
app.get('/produtos', async (req, res) => {
  // 'async' e 'await' são usados porque falar com o banco de dados demora um tempo (é assíncrono)
  const { data, error } = await supabase
    .from('produtos') // Da tabela 'produtos'
    .select('*');     // Selecione todas as colunas

  if (error) {
    console.error('Erro ao buscar produtos:', error);
    return res.status(500).json({ erro: error.message });
  }

  res.json(data); // Retorna os dados do banco
});
// ... (seu código do app.post('/produtos') ...)

// NOVO: [ATUALIZAR] PUT /produtos/:id - Atualizar um produto
app.put('/produtos/:id', async (req, res) => {
    // 1. Pegar o ID da URL e os novos dados do corpo
    const { id } = req.params;
    const { nome, data_validade } = req.body;

    console.log(`Recebida requisição para ATUALIZAR o produto ID: ${id}`);

    // Validação simples
    if (!nome || !data_validade) {
        return res.status(400).json({ erro: "Nome e data_validade são obrigatórios." });
    }

    // 2. Pedir ao Supabase para atualizar
    const { data, error } = await supabase
        .from('produtos')
        .update({             // Comando de atualizar
            nome: nome,
            data_validade: data_validade
        })
        .eq('id', id)         // Onde (where) o 'id' é igual
        .select();            // Retorna o item atualizado

    if (error) {
        console.error('Erro ao atualizar produto:', error);
        return res.status(500).json({ erro: error.message });
    }

    // 3. Se deu certo, respondemos com "200 OK" e o item atualizado
    console.log('Produto atualizado:', data[0]);
    res.status(200).json(data[0]); 
});

// NOVO: [DELETAR] DELETE /produtos/:id - Deletar um produto
app.delete('/produtos/:id', async (req, res) => {
    // O ':id' na URL é um "parâmetro".
    // Pegamos o valor dele usando 'req.params.id'
    const { id } = req.params;

    console.log('Recebida requisição para DELETAR o produto ID:', id);

    // 2. Pedir ao Supabase para deletar
    const { data, error } = await supabase
        .from('produtos')
        .delete()       // Comando de deletar
        .eq('id', id);  // Onde (where) o 'id' da tabela é igual ao 'id' que recebemos

    if (error) {
        console.error('Erro ao deletar produto:', error);
        return res.status(500).json({ erro: error.message });
    }

    // 3. Se deu certo, respondemos com "204 No Content"
    // Isso é um padrão HTTP que significa "Deu certo, e não tenho nada para te dizer."
    console.log('Produto deletado com sucesso:', id);
    res.status(204).send(); 
});

// ... (seu código do app.get('/send-alerts') ...)

// [CRIAR] POST /produtos - Cadastrar um novo produto
app.post('/produtos', async (req, res) => {
  const { nome, data_validade } = req.body; // Pega os dados do corpo da requisição

  if (!nome || !data_validade) {
    return res.status(400).json({ erro: "Nome e data_validade são obrigatórios." });
  }

  // Insere os dados no Supabase
  const { data, error } = await supabase
    .from('produtos')       // Na tabela 'produtos'
    .insert([               // Insira um novo registro
      { nome: nome, data_validade: data_validade }
    ])
    .select(); // O .select() é para o Supabase retornar o que ele acabou de criar

  if (error) {
    console.error('Erro ao criar produto:', error);
    return res.status(500).json({ erro: error.message });
  }

  // 'data' será um array, então pegamos o primeiro item [0]
  console.log("Novo produto cadastrado:", data[0]);
  res.status(201).json(data[0]);
});

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
  console.log('Conectado ao Supabase!');
  console.log('CORS habilitado para todas as origens.');
});