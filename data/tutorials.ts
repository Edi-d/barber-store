// ─────────────────────────────────────────────────────────────────────────────
// Tutorial content definitions — static data, no DB required
// All text content is in Romanian
// ─────────────────────────────────────────────────────────────────────────────

export interface TutorialStep {
  targetScreen: string;
  targetRefKey: string;
  title: string;
  description: string;
  position: 'top' | 'bottom';
}

export interface TutorialLesson {
  id: string;
  title: string;
  type: 'text' | 'interactive';
  durationSec: number;
  content?: string;
  steps?: TutorialStep[];
}

export interface TutorialChapter {
  id: string;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  iconBgColor: string;
  lessons: TutorialLesson[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Chapter 0 — Bine ai venit pe Tapzi
// ─────────────────────────────────────────────────────────────────────────────

export const CHAPTER_WELCOME: TutorialChapter = {
  id: 'ch0-welcome',
  title: 'Bine ai venit pe Tapzi',
  description: 'Primul tau pas: afla ce poti face cu aplicatia si cum te descurci in ea',
  icon: 'rocket',
  iconColor: '#8B5CF6',
  iconBgColor: 'rgba(139,92,246,0.1)',
  lessons: [
    {
      id: 'ch0-l1-what-is-tapzi',
      title: 'Ce este Tapzi?',
      type: 'text',
      durationSec: 45,
      content: `## Ce face Tapzi pentru tine?

Tapzi este platforma dedicata comunitatii de frizerie si coafura din Romania. Tot ce ai nevoie — programari, produse profesionale si inspiratie — intr-un singur loc.

## Functii principale

- Descopera saloane pe harta si vezi care sunt disponibile acum
- Programeaza-te la frizerul tau preferat in cativa pasi
- Cumpara produse profesionale la preturi de partener
- Urmareste feed-ul comunitatii cu trenduri si inspiratie
- Vezi stories si live-uri de la frizeri si creatori

## Pentru cine este?

Tapzi e pentru toata lumea — fie ca vrei o tunsoare rapida, un styling complet sau sa descoperi cele mai bune saloane din zona ta. Daca esti profesionist, Tapzi te ajuta sa-ti gestionezi programarile si sa-ti cresti vizibilitatea.

💡 Poti accesa tutorialele oricand din Profil > Tutoriale aplicatie`,
    },
    {
      id: 'ch0-l2-navigation',
      title: 'Navigarea in aplicatie',
      type: 'interactive',
      durationSec: 60,
      steps: [
        {
          targetScreen: '/(tabs)/feed',
          targetRefKey: 'tab-feed',
          title: 'Feed-ul tau',
          description: 'Aici vezi postarile comunitatii, stories si live-uri',
          position: 'top',
        },
        {
          targetScreen: '/(tabs)/discover',
          targetRefKey: 'tab-discover',
          title: 'Programari',
          description: 'Descopera saloane pe harta si fa programari',
          position: 'top',
        },
        {
          targetScreen: '/(tabs)/shop',
          targetRefKey: 'tab-shop',
          title: 'Magazin',
          description: 'Cumpara produse profesionale de ingrijire',
          position: 'top',
        },
        {
          targetScreen: '/(tabs)/profile',
          targetRefKey: 'tab-profile',
          title: 'Profilul tau',
          description: 'Gestioneaza contul, programarile si comenzile',
          position: 'top',
        },
      ],
    },
    {
      id: 'ch0-l3-profile',
      title: 'Profilul tau',
      type: 'interactive',
      durationSec: 50,
      steps: [
        {
          targetScreen: '/(tabs)/profile',
          targetRefKey: 'profile-hero',
          title: 'Informatiile tale',
          description: 'Aici vezi avatarul, numele si statistica profilului tau',
          position: 'bottom',
        },
        {
          targetScreen: '/(tabs)/profile',
          targetRefKey: 'profile-menu-appointments',
          title: 'Programarile mele',
          description: 'Acceseaza rapid programarile tale viitoare si trecute',
          position: 'bottom',
        },
        {
          targetScreen: '/(tabs)/profile',
          targetRefKey: 'profile-menu-tutorials',
          title: 'Tutoriale',
          description: 'Revino oricand aici pentru a invata functiile aplicatiei',
          position: 'bottom',
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Chapter 1 — Programari
// ─────────────────────────────────────────────────────────────────────────────

export const CHAPTER_APPOINTMENTS: TutorialChapter = {
  id: 'ch1-appointments',
  title: 'Programari',
  description: 'Cum gasesti saloane, explorezi servicii si faci o programare completa',
  icon: 'map',
  iconColor: '#0A66C2',
  iconBgColor: 'rgba(10,102,194,0.1)',
  lessons: [
    {
      id: 'ch1-l1-discover-map',
      title: 'Descopera saloane pe harta',
      type: 'text',
      durationSec: 60,
      content: `## Harta interactiva

Pagina Programari (tab-ul cu iconita de calendar) iti arata o harta cu toate saloanele din zona ta. Fiecare marker reprezinta un salon — apasa pe el pentru a vedea detalii rapide.

## Cum citesti harta

- Markere albastre: saloane disponibile acum
- Markere gri: saloane inchise sau ocupate
- Butonul de locatie te centreaza pe pozitia ta curenta

## Categorii

Poti alege intre doua categorii de saloane: Barbershop (tuns, barba, fade) si Coafor (coafura, vopsit, styling). Selecteaza categoria potrivita cand deschizi pagina.

## Bottom sheet

Trage in sus panoul de jos pentru a vedea mai multe: saloane recomandate, happy hour-uri active, saloanele tale favorite si lista completa.

💡 Activeaza filtrul “Disponibil acum” pentru a vedea doar saloanele unde poti merge imediat`,
    },
    {
      id: 'ch1-l2-filters-search',
      title: 'Foloseste filtrele si cautarea',
      type: 'interactive',
      durationSec: 90,
      steps: [
        {
          targetScreen: '/(tabs)/discover',
          targetRefKey: 'discover-search',
          title: 'Bara de cautare',
          description: 'Cauta saloane dupa nume, oras sau specialitate. Rezultatele apar instant pe harta.',
          position: 'bottom',
        },
        {
          targetScreen: '/(tabs)/discover',
          targetRefKey: 'discover-filter-available',
          title: 'Filtru disponibilitate',
          description: 'Apasa pentru a vedea doar saloanele disponibile acum in zona ta.',
          position: 'bottom',
        },
        {
          targetScreen: '/(tabs)/discover',
          targetRefKey: 'tab-discover',
          title: 'Exploreaza mai departe',
          description: 'Trage panoul de jos in sus pentru a vedea saloane recomandate, favorite si happy hour-uri active.',
          position: 'top',
        },
      ],
    },
    {
      id: 'ch1-l3-explore-salon',
      title: 'Exploreaza un salon',
      type: 'text',
      durationSec: 90,
      content: `## Pagina de salon

Cand apesi pe un salon, se deschide pagina cu toate detaliile. In partea de sus gasesti galeria foto — poti naviga prin poze glisand stanga/dreapta.

## Ce informatii gasesti

- Rating si numar de recenzii
- Adresa exacta cu optiune de navigare
- Programul saptamanal (verde = deschis, rosu = inchis)
- Facilitati: parcare, WiFi, plata cu cardul, cafea

## Servicii si echipa

Serviciile sunt grupate pe categorii: Tuns, Barba, Colorare, Pachete. Fiecare serviciu arata pretul si durata. Poti apasa „Rezervati” direct pe un serviciu.

Echipa salonului apare intr-o sectiune dedicata — vezi avatarul, numele si specialitatea fiecarui frizer.

## Recenzii

In partea de jos gasesti recenziile altor clienti. Poti lasa si tu o recenzie cu stele, text si chiar o poza dupa vizita.

💡 Urmareste banner-ul Happy Hour — daca e activ, primesti discount la toate serviciile`,
    },
    {
      id: 'ch1-l4-choose-barber',
      title: 'Alege frizerul potrivit',
      type: 'text',
      durationSec: 60,
      content: `## Pasul 1: Alege frizerul

Cand incepi o programare, primul pas este sa alegi frizerul. Vei vedea o lista cu toti frizerii disponibili la salonul ales.

## Ce vezi pe fiecare card

- Avatarul si numele frizerului
- Rolul (Proprietar sau Frizer)
- Specialitatile (fade, barba, styling etc.)

## Cum selectezi

Apasa pe cardul frizerului dorit. O bifa albastra confirma selectia si treci automat la pasul urmator.

💡 Daca salonul are un singur frizer, acesta e selectat automat`,
    },
    {
      id: 'ch1-l5-select-services',
      title: 'Selecteaza serviciile',
      type: 'text',
      durationSec: 60,
      content: `## Pasul 2: Alege serviciile

Dupa ce ai ales frizerul, selecteaza serviciile dorite. Poti alege mai multe servicii in aceeasi programare.

## Selectie multipla

- Apasa pe un serviciu pentru a-l selecta — apare o bifa
- Apasa din nou pentru a-l deselecta
- Pretul si durata totala se actualizeaza in timp real

## Bara de sumar

In partea de jos apare o bara cu totalul: numarul de servicii, durata estimata si pretul total. Apasa "Continua" pentru pasul urmator.

💡 Preturile includ TVA si nu exista costuri ascunse`,
    },
    {
      id: 'ch1-l6-date-time',
      title: 'Alege data si ora',
      type: 'text',
      durationSec: 60,
      content: `## Pasul 3: Data si ora

Alege ziua si ora programarii dintr-un calendar interactiv.

## Selecteaza ziua

Scroll orizontal prin urmatoarele 14 zile. Ziua curenta e marcata cu "Azi" si un punct pulsant. Zilele indisponibile (de obicei duminica) sunt gri.

## Selecteaza ora

Orele sunt impartite in doua sectiuni: Dimineata si Dupa-amiaza. Sloturile verzi sunt libere, cele gri sunt ocupate. Intervalele sunt de 30 de minute.

💡 Alege o ora de dimineata pentru mai multa disponibilitate — sunt de obicei mai putini clienti`,
    },
    {
      id: 'ch1-l7-confirm-booking',
      title: 'Confirma programarea',
      type: 'text',
      durationSec: 60,
      content: `## Pasul 4: Confirmare

Ultimul pas — verifica detaliile si confirma programarea.

## Ce vezi in sumar

- Frizerul ales cu avatar si rol
- Serviciile selectate cu pretul fiecaruia
- Data si ora alese
- Totalul final

## Note optionale

Poti adauga instructiuni speciale pentru frizer, de exemplu "fade mediu, pastrat lungimea sus". Campul e optional.

## Confirmare

Apasa butonul "Confirma Programarea" — vei primi confirmarea instant cu un ecran de succes si optiunea de a adauga in calendar.

💡 Poti anula sau reprograma oricand din Profil > Programarile mele`,
    },
    {
      id: 'ch1-l8-manage-appointments',
      title: 'Gestioneaza programarile',
      type: 'text',
      durationSec: 60,
      content: `## Programarile mele

Acceseaza programarile tale din Profil > Programarile mele. Aici gasesti doua sectiuni: Viitoare si Istoric.

## Programari viitoare

- Fiecare card arata data, ora, frizerul si serviciile alese
- Statusul poate fi „In asteptare” sau „Confirmata”
- Poti anula o programare apasand pe ea

## Istoric

Tabul Istoric iti arata toate programarile anterioare. E util daca vrei sa reprogramezi la acelasi frizer sau sa lasi o recenzie.

## Reprogramare

Daca vrei sa schimbi data sau ora, anuleaza programarea curenta si creeaza una noua. Procesul e rapid — datele anterioare sunt precompletate.

💡 Vei primi notificari de reminder inainte de fiecare programare`,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Chapter 2 — Shop
// ─────────────────────────────────────────────────────────────────────────────

export const CHAPTER_SHOP: TutorialChapter = {
  id: 'ch2-shop',
  title: 'Shop',
  description: 'Cum cumperi produse profesionale direct din aplicatie',
  icon: 'bag-handle',
  iconColor: '#6366F1',
  iconBgColor: 'rgba(99,102,241,0.1)',
  lessons: [
    {
      id: 'ch2-l1-browse-catalog',
      title: 'Rasfoieste catalogul',
      type: 'text',
      durationSec: 60,
      content: `## Magazinul Tapzi

Magazinul iti pune la dispozitie o selectie curata de produse profesionale — aceleasi produse pe care le folosesc frizerii si coaforii parteneri.

## Cum e organizat

- Populare: cele mai cumparate produse din ultimele 30 de zile
- Discounturi: produse cu reduceri active
- Categorii: clesti, masini de tuns, ceara, gel, produse barba, samponuri si multe altele
- Branduri: filtreaza dupa brandul preferat

## Pretul de partener

Pretul afisat este pretul de partener — un pret negociat exclusiv pentru comunitatea Tapzi, mai mic decat pretul de retail. Pe fiecare card vezi si economia fata de pretul recomandat.

## Navigare rapida

Poti cauta produse dupa nume sau brand in bara de cautare. Foloseste filtrele de categorie si brand pentru a restrange rezultatele. Butonul de sortare iti permite sa ordonezi dupa pret, discount sau relevanta.

💡 Urmareste sectiunea Discounturi — ofertele se schimba saptamanal`,
    },
    {
      id: 'ch2-l2-search-filter',
      title: 'Cauta si filtreaza produse',
      type: 'interactive',
      durationSec: 60,
      steps: [
        {
          targetScreen: '/(tabs)/shop',
          targetRefKey: 'shop-search',
          title: 'Cauta produse',
          description: 'Scrie numele sau brandul produsului cautat. Rezultatele se filtreaza instant.',
          position: 'bottom',
        },
        {
          targetScreen: '/(tabs)/shop',
          targetRefKey: 'shop-category-filter',
          title: 'Filtru categorie',
          description: 'Alege din categorii: clesti, ceara, gel, masini de tuns si multe altele.',
          position: 'bottom',
        },
        {
          targetScreen: '/(tabs)/shop',
          targetRefKey: 'shop-sort-btn',
          title: 'Sorteaza rezultatele',
          description: 'Ordoneaza produsele dupa pret, discount sau relevanta.',
          position: 'bottom',
        },
      ],
    },
    {
      id: 'ch2-l3-product-details',
      title: 'Detaliile unui produs',
      type: 'text',
      durationSec: 60,
      content: `## Pagina de produs

Apasa pe orice produs din catalog pentru a vedea detaliile complete intr-un panou care se deschide de jos.

## Ce gasesti

- Imaginea produsului pe fundal gradient
- Brandul si numele complet
- Descrierea produsului (daca exista)
- Pretul de partener si economia fata de pretul retail

## Adauga in cos

Alege cantitatea dorita cu butoanele + si -, apoi apasa "Adauga in cos". Produsul apare instant in cosul de cumparaturi.

💡 Poti adauga mai multe bucati din acelasi produs fara sa inchizi panoul`,
    },
    {
      id: 'ch2-l4-cart',
      title: 'Cosul de cumparaturi',
      type: 'text',
      durationSec: 60,
      content: `## Cosul de cumparaturi

Acceseaza cosul apasand pe iconita de cos din tab-ul Magazin sau din bara care apare in josul ecranului cand ai produse.

## Gestioneaza produsele

- Modifica cantitatea cu butoanele + si -
- Gliseaza un produs la stanga pentru a-l sterge
- Bara de livrare gratuita iti arata cat mai ai de adaugat pana la pragul de 200 RON

## Livrare gratuita

Cand totalul depaseste 200 RON, livrarea devine gratuita. Bara de progres se coloreaza verde cand atingi pragul.

💡 Apasa "Continua la plata" cand esti multumit cu cosul`,
    },
    {
      id: 'ch2-l5-checkout',
      title: 'Finalizeaza comanda',
      type: 'text',
      durationSec: 60,
      content: `## Procesul de checkout

Dupa ce apesi "Continua la plata", completezi formularul de comanda in cativa pasi simpli.

## Informatii necesare

- Nume si numar de telefon (obligatorii)
- Metoda de livrare: ridicare personala sau livrare la adresa
- Adresa completa (daca alegi livrare)
- Note speciale (optional)

## Plata

Deocamdata disponibila: plata ramburs la livrare. Platesti cash cand primesti coletul. Plata online cu cardul va fi disponibila in curand.

## Confirmare

Verifica totalul si apasa "Plaseaza comanda". Vei primi un ecran de confirmare cu numarul comenzii si optiunea de a vedea comenzile sau de a continua cumparaturile.

💡 Datele de contact sunt salvate — nu trebuie sa le completezi la fiecare comanda`,
    },
    {
      id: 'ch2-l6-track-orders',
      title: 'Urmareste comenzile',
      type: 'text',
      durationSec: 45,
      content: `## Comenzile mele

Dupa ce plasezi o comanda, o gasesti in Profil > Comenzile mele. Fiecare comanda are un card cu detalii complete.

## Statusuri

- In asteptare: comanda a fost plasata si urmeaza sa fie procesata
- Platita: plata a fost confirmata
- Expediata: comanda e pe drum
- Anulata: comanda a fost anulata

## Detalii comanda

Apasa pe o comanda pentru a vedea: produsele comandate cu cantitati si preturi, totalul, adresa de livrare si numarul comenzii.

## Istoric

Toate comenzile ramam in istoric, indiferent de status. Poti reveni oricand sa verifici ce ai comandat anterior sau sa recomanzi un produs.

💡 Vei primi notificari cand statusul comenzii se schimba`,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Chapter 3 — Feed Social
// ─────────────────────────────────────────────────────────────────────────────

export const CHAPTER_FEED: TutorialChapter = {
  id: 'ch3-feed',
  title: 'Feed Social',
  description: 'Cum interactionezi cu comunitatea - postari, stories si live-uri',
  icon: 'chatbubbles',
  iconColor: '#16A34A',
  iconBgColor: 'rgba(22,163,74,0.1)',
  lessons: [
    {
      id: 'ch3-l1-feed-overview',
      title: 'Feed-ul tau',
      type: 'text',
      durationSec: 60,
      content: `## Feed-ul comunitatii

Feed-ul este pagina principala a aplicatiei — aici vezi postarile, stories si live-urile din comunitatea Tapzi. E locul perfect pentru inspiratie si trenduri.

## Ce gasesti in feed

- Postari cu imagini si videoclipuri de la frizeri si creatori
- Stories in partea de sus — cercuri albastre inseamna stories nevazute
- Sectiunea Live — vezi cine transmite in direct
- Banner "Postari noi" — apasa pentru a vedea cele mai recente

## Videoclipuri

Videoclipurile se redau automat cand sunt vizibile pe ecran. Sunetul e dezactivat implicit — apasa pe video pentru a activa sunetul.

## Interactiuni

Pe fiecare postare poti da like (sau dublu-tap pe imagine), comenta, distribui sau urmari creatorul. Comentariile suporta si reactii emoji.

## Filtre si sortare

Foloseste filtrele din partea de sus: Toate, Urmariti, Populare, Recente, Imagini, Videoclipuri. Butonul de sortare iti permite sa alegi intre Trending, Cele mai noi si Cele mai apreciate.

💡 Feed-ul se actualizeaza in timp real — vei vedea un banner cand apar postari noi`,
    },
    {
      id: 'ch3-l2-interactions',
      title: 'Like, comenteaza si reactioneaza',
      type: 'text',
      durationSec: 60,
      content: `## Interactiuni cu postarile

Pe fiecare postare din feed ai mai multe optiuni de interactiune.

## Like

Apasa butonul de like (inima) sau fa dublu-tap pe imaginea postarii pentru a da like. Animatia de inima confirma actiunea.

## Comentarii

Apasa butonul de comentariu pentru a deschide panoul de comentarii. Poti scrie un comentariu, raspunde la altele si adauga reactii emoji (tine apasat pe un comentariu).

## Distribuie

Butonul de share iti permite sa trimiti postarea prietenilor prin orice aplicatie instalata pe telefon.

## Urmareste

Apasa "Urmareste" pe profilul unui creator pentru a vedea postarile lui in feed-ul tau. Butonul se schimba in "Urmaresti" dupa activare.

💡 Dublu-tap pe imagine e cea mai rapida metoda de a da like`,
    },
    {
      id: 'ch3-l3-stories',
      title: 'Stories - cum functioneaza',
      type: 'text',
      durationSec: 60,
      content: `## Cum functioneaza Stories

Stories apar in randul de cercuri din partea de sus a feed-ului. Fiecare cerc reprezinta un creator.

## Indicatori vizuali

- Cerc albastru: stories nevazute — apasa pentru a vizualiza
- Cerc gri: toate stories-urile au fost vazute
- Stories dispar automat dupa 24 de ore

## Navigare in stories

- Tap dreapta: urmatorul story
- Tap stanga: story-ul anterior
- Tine apasat: pauza
- Gliseaza stanga/dreapta: sari la alt creator

## Sunet

Videoclipurile din stories au sunetul dezactivat implicit. Apasa butonul de sunet pentru a activa audio.

💡 Bara de progres din partea de sus iti arata cate stories mai are creatorul`,
    },
    {
      id: 'ch3-l4-live',
      title: 'Urmareste un live',
      type: 'text',
      durationSec: 60,
      content: `## Sectiunea Live

In feed, sub stories, gasesti sectiunea "Creatori Live". Aici vezi cine transmite in direct.

## Cum te uiti la un live

Apasa pe un card de live pentru a te alatura. Vei vedea video-ul creatorului si poti interactiona prin chat.

## Chat in timp real

- Scrie mesaje in caseta de chat din josul ecranului
- Mesajele apar instant pentru toti spectatorii
- Limita: maxim un mesaj pe secunda

## Controlul ecranului

- Apasa pe ecran pentru a afisa/ascunde butoanele
- Butonul X inchide live-ul
- Vezi numarul de spectatori in coltul din dreapta sus

💡 Vei primi notificare cand un creator pe care il urmaresti incepe un live`,
    },
    {
      id: 'ch3-l5-filters-sort',
      title: 'Foloseste filtrele si sortarea',
      type: 'text',
      durationSec: 60,
      content: `## Filtre rapide

Sub sectiunea de live-uri gasesti o bara cu filtre. Apasa pe un filtru pentru a schimba ce vezi in feed:

- Toate: toate postarile din comunitate
- Urmariti: doar de la creatorii pe care ii urmaresti
- Populare: cele mai apreciate postari
- Recente: cele mai noi postari
- Imagini: doar postari cu fotografii
- Videoclipuri: doar postari video

## Sortare

Apasa iconita de sortare (langa titlul "Toate postarile") pentru a alege ordinea:

- Trending: postari cu cel mai mare engagement recent
- Cele mai noi: ordonate cronologic
- Cele mai apreciate: ordonate dupa numarul de like-uri

💡 Filtrul "Urmariti" e cel mai util dupa ce incepi sa urmaresti cativa creatori`,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export const TUTORIALS: TutorialChapter[] = [
  CHAPTER_WELCOME,
  CHAPTER_APPOINTMENTS,
  CHAPTER_SHOP,
  CHAPTER_FEED,
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a chapter by its id.
 */
export function getTutorialById(chapterId: string): TutorialChapter | undefined {
  return TUTORIALS.find((chapter) => chapter.id === chapterId);
}

/**
 * Find a lesson by its id, searching across all chapters.
 */
export function getLessonById(lessonId: string): TutorialLesson | undefined {
  for (const chapter of TUTORIALS) {
    const lesson = chapter.lessons.find((l) => l.id === lessonId);
    if (lesson !== undefined) {
      return lesson;
    }
  }
  return undefined;
}

/**
 * Find the parent chapter for a given lesson id.
 */
export function getChapterForLesson(lessonId: string): TutorialChapter | undefined {
  return TUTORIALS.find((chapter) =>
    chapter.lessons.some((l) => l.id === lessonId),
  );
}
