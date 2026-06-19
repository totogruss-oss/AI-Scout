import { Expert } from './types';

export const INITIAL_EXPERTS: Expert[] = [
  { 
    id: '1', 
    name: 'Andrew Ng', 
    role: 'Educator, Entrepreneur', 
    topics: ['Machine Learning', 'Deep Learning', 'AI Education', 'Business Applications'], 
    twitterHandle: '@AndrewYNg', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Andrew_Ng_-_Time_100_Gala_2024_%28cropped%29.jpg/800px-Andrew_Ng_-_Time_100_Gala_2024_%28cropped%29.jpg'
  },
  { 
    id: '2', 
    name: 'Geoffrey Hinton', 
    role: 'Researcher, Scientist', 
    topics: ['Deep Learning', 'Neural Networks', 'AI Safety', 'Risks'], 
    twitterHandle: '@geoffreyhinton', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Geoffrey_Hinton_at_the_2024_Nobel_Prize_Press_Conference_%28cropped%29.jpg/800px-Geoffrey_Hinton_at_the_2024_Nobel_Prize_Press_Conference_%28cropped%29.jpg'
  },
  { 
    id: '3', 
    name: 'Yann LeCun', 
    role: 'Chief AI Scientist (Meta)', 
    topics: ['Deep Learning', 'Computer Vision', 'Open Source AI', 'AGI-Diskurs'], 
    twitterHandle: '@ylecun', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Yann_LeCun_-_2018_%28cropped%29.jpg/800px-Yann_LeCun_-_2018_%28cropped%29.jpg'
  },
  { 
    id: '4', 
    name: 'Fei-Fei Li', 
    role: 'Researcher, Director (Stanford)', 
    topics: ['Computer Vision', 'Human-Centered AI', 'AI Ethics', 'Healthcare', 'Education'], 
    twitterHandle: '@fei_fei_li', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Fei-Fei_Li_2024.jpg/800px-Fei-Fei_Li_2024.jpg'
  },
  { 
    id: '5', 
    name: 'Demis Hassabis', 
    role: 'CEO (DeepMind)', 
    topics: ['Deep Reinforcement Learning', 'AlphaGo', 'AlphaFold', 'Neuroscience'], 
    twitterHandle: '@demishassabis', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Demis_Hassabis_Royal_Society.jpg/800px-Demis_Hassabis_Royal_Society.jpg'
  },
  { 
    id: '6', 
    name: 'Andrej Karpathy', 
    role: 'Educator, Engineer', 
    topics: ['Computer Vision', 'Deep Learning', 'Self-Driving Cars', 'AI Agents'], 
    twitterHandle: '@karpathy', 
    active: true,
    imageUrl: 'https://avatars.githubusercontent.com/u/17522?v=4'
  },
  { 
    id: '7', 
    name: 'Yoshua Bengio', 
    role: 'Researcher, Scientist', 
    topics: ['Deep Learning', 'AI Ethics', 'AI Governance', 'Safety'], 
    twitterHandle: '@yoshua_bengio', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Yoshua_Bengio_2019.jpg/800px-Yoshua_Bengio_2019.jpg'
  },
  { 
    id: '8', 
    name: 'Ian Goodfellow', 
    role: 'Researcher, Scientist', 
    topics: ['Generative Models', 'GANs', 'Deep Learning', 'AI Security'], 
    twitterHandle: '@goodfellow_ian', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Ian_Goodfellow.jpg/800px-Ian_Goodfellow.jpg'
  },
  { 
    id: '9', 
    name: 'Cassie Kozyrkov', 
    role: 'Decision Scientist', 
    topics: ['Decision Intelligence', 'AI in Organizations', 'AI Skepticism'], 
    twitterHandle: '@cassiekozyrkov', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Cassie_Kozyrkov_2019.jpg/800px-Cassie_Kozyrkov_2019.jpg'
  },
  { 
    id: '10', 
    name: 'Mustafa Suleyman', 
    role: 'CEO (Microsoft AI)', 
    topics: ['AI Governance', 'Ethics', 'Human Rights', 'Policy', 'Consumer AI'], 
    twitterHandle: '@mustafasuleyman', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Mustafa_Suleyman_2023.jpg/800px-Mustafa_Suleyman_2023.jpg'
  },
  { 
    id: '11', 
    name: 'Doris Weßels', 
    role: 'Professor, Researcher', 
    topics: ['Generative AI', 'Education', 'NLP', 'Business AI', 'Prüfungskultur'], 
    twitterHandle: '@doris_wessels', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Doris_Wessels_2023.jpg/800px-Doris_Wessels_2023.jpg'
  },
  { 
    id: '12', 
    name: 'Peter Steinberger', 
    role: 'Engineer, Developer', 
    topics: ['Open Source AI', 'AI Agents', 'LLM Engineering', 'Practical Implementation'], 
    twitterHandle: '@psteinberger', 
    active: true,
    imageUrl: 'https://avatars.githubusercontent.com/u/10137?v=4'
  },
  { 
    id: '13', 
    name: 'Cedric Mössner (The Morpheus)', 
    role: 'Educator, YouTube Creator', 
    topics: ['AI Education', 'Machine Learning', 'Security', 'Programming'], 
    twitterHandle: '@TheMorpheus7', 
    active: true,
    imageUrl: 'https://avatars.githubusercontent.com/u/19875334?v=4'
  },
  { 
    id: '14', 
    name: 'Yasmin Weiß', 
    role: 'Professor, Futurist', 
    topics: ['Future Skills', 'Education', 'AI & Work', 'Competencies'], 
    twitterHandle: '@YasminWeiss', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Yasmin_Weiss_2022.jpg/800px-Yasmin_Weiss_2022.jpg'
  },
  { 
    id: '15', 
    name: 'Dario Amodei', 
    role: 'CEO (Anthropic)', 
    topics: ['AI Safety', 'Risk Assessment', 'Model Security', 'Responsible AI'], 
    twitterHandle: '@darioamodei', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Dario_Amodei_2023.jpg/800px-Dario_Amodei_2023.jpg'
  },
  { 
    id: '16', 
    name: 'Mira Murati', 
    role: 'Entrepreneur, Ex-CTO OpenAI', 
    topics: ['Generative AI', 'Responsible AI', 'Model Development', 'Leadership'], 
    twitterHandle: '@MiraMurati', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Mira_Murati_2023.jpg/800px-Mira_Murati_2023.jpg'
  },
  { 
    id: '17', 
    name: 'Stuart Russell', 
    role: 'Professor, Researcher', 
    topics: ['AI Safety', 'AI Governance', 'Decision Theory', 'Long-term Risks'], 
    twitterHandle: '@s_russell', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Stuart_J._Russell_2019.jpg/800px-Stuart_J._Russell_2019.jpg'
  },
  { 
    id: '18', 
    name: 'Timnit Gebru', 
    role: 'Researcher, Activist', 
    topics: ['AI Bias', 'Fairness', 'Ethics', 'Power Structures'], 
    twitterHandle: '@timnit', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Timnit_Gebru_2021.jpg/800px-Timnit_Gebru_2021.jpg'
  },
  { 
    id: '19', 
    name: 'Gary Marcus', 
    role: 'Researcher, Critic', 
    topics: ['AI Limitations', 'Hybrid AI', 'Robustness', 'Regulation'], 
    twitterHandle: '@GaryMarcus', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Gary_Marcus_2019.jpg/800px-Gary_Marcus_2019.jpg'
  },
  { 
    id: '20', 
    name: 'Max Tegmark', 
    role: 'Professor, Activist', 
    topics: ['AI Safety', 'Existential Risks', 'Governance', 'Long-term AI Strategy'], 
    twitterHandle: '@tegmark', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Max_Tegmark_2018.jpg/800px-Max_Tegmark_2018.jpg'
  },
  { 
    id: '21', 
    name: 'Jürgen Schmidhuber', 
    role: 'Professor, Researcher', 
    topics: ['Deep Learning Architecture', 'LSTM', 'GANs', 'AGI Predictions'], 
    twitterHandle: '@juergenscmidhuber', 
    active: true,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/J%C3%BCrgen_Schmidhuber_2017.jpg/800px-J%C3%BCrgen_Schmidhuber_2017.jpg'
  }
];