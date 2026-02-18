import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Radio,
  MessageCircle,
  Bitcoin,
  DollarSign,
  Wifi,
  Lock,
  Users,
  ChevronRight,
} from 'lucide-react-native';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ONBOARDING_KEY = 'BITMESH_ONBOARDING_DONE';

interface Slide {
  id: number;
  icon: any;
  title: string;
  subtitle: string;
  description: string;
  color: string;
}

const slides: Slide[] = [
  {
    id: 1,
    icon: MessageCircle,
    title: 'Bienvenue sur BitMesh',
    subtitle: 'Messagerie P2P décentralisée',
    description:
      'BitMesh est une application de messagerie décentralisée qui utilise le protocole MeshCore pour envoyer des messages chiffrés via LoRa ou MQTT, sans serveur central.',
    color: Colors.accent,
  },
  {
    id: 2,
    icon: Radio,
    title: 'MeshCore Protocol',
    subtitle: 'Communication longue portée',
    description:
      'MeshCore permet de communiquer via LoRa (jusqu\'à 20 km en ligne de vue) ou MQTT (Internet). Les messages sont automatiquement routés via le réseau mesh.',
    color: Colors.green,
  },
  {
    id: 3,
    icon: Bitcoin,
    title: 'Bitcoin & Cashu',
    subtitle: 'Paiements intégrés',
    description:
      'Envoyez des sats via Lightning ou Cashu eCash directement dans vos conversations. Votre wallet est chiffré et stocké localement sur votre appareil.',
    color: Colors.accent,
  },
  {
    id: 4,
    icon: Wifi,
    title: 'Connecter un device',
    subtitle: 'En quelques clics',
    description:
      '1️⃣ Allumez votre gateway LoRa\n2️⃣ Ouvrez l\'onglet Mesh\n3️⃣ Appuyez sur "Scan"\n4️⃣ Votre device apparaît sur le radar GPS\n5️⃣ Tapez pour connecter et commencer à échanger !',
    color: Colors.green,
  },
];

function SlideIndicator({ active }: { active: boolean }) {
  return (
    <View
      style={[
        styles.indicator,
        {
          width: active ? 28 : 8,
          backgroundColor: active ? Colors.accent : Colors.textMuted,
        },
      ]}
    />
  );
}

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animation d'entrée
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      scrollViewRef.current?.scrollTo({
        x: nextIndex * SCREEN_WIDTH,
        animated: true,
      });
      // Reset animation
      slideAnim.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(tabs)');
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(tabs)');
  };

  const currentSlide = slides[currentIndex];
  const IconComponent = currentSlide.icon;

  return (
    <View style={styles.container}>
      {/* Header avec Skip */}
      <View style={styles.header}>
        <Text style={styles.logo}>BitMesh</Text>
        {currentIndex < slides.length - 1 && (
          <TouchableOpacity onPress={handleSkip}>
            <Text style={styles.skipButton}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Slides */}
      <Animated.View
        style={[
          styles.contentContainer,
          {
            opacity: fadeAnim,
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [50, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* Icône animée */}
        <View style={[styles.iconContainer, { backgroundColor: `${currentSlide.color}20` }]}>
          <IconComponent size={80} color={currentSlide.color} strokeWidth={1.5} />
        </View>

        {/* Titre */}
        <Text style={styles.title}>{currentSlide.title}</Text>
        <Text style={[styles.subtitle, { color: currentSlide.color }]}>
          {currentSlide.subtitle}
        </Text>

        {/* Description */}
        <Text style={styles.description}>{currentSlide.description}</Text>

        {/* Features (seulement slide 1) */}
        {currentIndex === 0 && (
          <View style={styles.featuresContainer}>
            <View style={styles.featureRow}>
              <Lock size={16} color={Colors.green} />
              <Text style={styles.featureText}>Chiffrement E2E (ECDH)</Text>
            </View>
            <View style={styles.featureRow}>
              <Users size={16} color={Colors.green} />
              <Text style={styles.featureText}>Forums multi-utilisateurs</Text>
            </View>
            <View style={styles.featureRow}>
              <DollarSign size={16} color={Colors.green} />
              <Text style={styles.featureText}>Paiements Bitcoin/Cashu</Text>
            </View>
          </View>
        )}
      </Animated.View>

      {/* Indicateurs */}
      <View style={styles.indicatorsContainer}>
        {slides.map((_, index) => (
          <SlideIndicator key={index} active={index === currentIndex} />
        ))}
      </View>

      {/* Boutons */}
      <View style={styles.buttonsContainer}>
        {currentIndex < slides.length - 1 ? (
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Suivant</Text>
            <ChevronRight size={20} color={Colors.background} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
            <Text style={styles.finishButtonText}>Commencer 🚀</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  logo: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.accent,
    fontFamily: 'monospace',
  },
  skipButton: {
    fontSize: 16,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  featuresContainer: {
    marginTop: 32,
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  indicatorsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 24,
  },
  indicator: {
    height: 8,
    borderRadius: 4,
  },
  buttonsContainer: {
    paddingHorizontal: 24,
  },
  nextButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  nextButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.background,
  },
  finishButton: {
    backgroundColor: Colors.green,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  finishButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.background,
  },
});
