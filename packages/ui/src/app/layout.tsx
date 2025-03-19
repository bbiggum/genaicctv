'use client';

import AppHeader from '@/components/ui/header';
import { Authenticator, ThemeProvider, Image, View, useTheme, Text, Heading } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { Amplify } from 'aws-amplify';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_USERPOOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_USERPOOL_CLIENT_ID!,
    },
  },
});

const components = {
  Header() {
    const { tokens } = useTheme();

    return (
      <View textAlign="center" padding={tokens.space.large}>
        <Image
          alt="AnyResort Logo"
          src="/images/logo.png"
          height="100px"
        />
        <Heading level={3} padding={`${tokens.space.xl} 0 0 0`}>
          Welcome to AnyResort App
        </Heading>
      </View>
    );
  },

  Footer() {
    const { tokens } = useTheme();

    return (
      <View textAlign="center" padding={tokens.space.large}>
        <Text color={tokens.colors.neutral[80]}>
          &copy; 2025 AnyResort. All rights reserved.
        </Text>
      </View>
    );
  },
};

const theme = {
  name: 'custom-theme',
  tokens: {
    colors: {
      brand: {
        primary: {
          10: '#e6f2ff',
          80: '#0066cc',
          90: '#004d99',
          100: '#003366',
        },
      },
    },
    components: {
      authenticator: {
        router: {
          borderWidth: '0',
          boxShadow: '{shadows.large}',
        },
      },
      button: {
        primary: {
          backgroundColor: '{colors.brand.primary.80}',
          color: '{colors.white}',
          _hover: {
            backgroundColor: '{colors.brand.primary.90}',
          },
        },
      },
      fieldcontrol: {
        _focus: {
          borderColor: '{colors.brand.primary.80}',
        },
      },
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`
          body {
            background-image: url('/images/background.png');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            min-height: 100vh;
          }
          [data-amplify-authenticator] {
            background-color: rgba(255, 255, 255, 0.8);
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
        `}</style>
      </head>
      <body className={inter.className}>
        <ThemeProvider theme={theme}>
          <Authenticator components={components}>
            <AppHeader />
            <Suspense>
              <Providers>{children}</Providers>
            </Suspense>
          </Authenticator>
        </ThemeProvider>
      </body>
    </html>
  );
}
