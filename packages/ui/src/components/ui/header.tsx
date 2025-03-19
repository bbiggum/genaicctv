'use client';

import { signOut } from 'aws-amplify/auth';  // AWS Amplify import 추가
import { Box, Heading, Flex, Button, useToast } from '@chakra-ui/react';
import { useRouter } from 'next/navigation'; // next/router 대신 next/navigation 사용
import { useCallback } from 'react';

interface AppHeaderProps {
  onLogout?: () => void; // 선택적 prop
}

const AppHeader: React.FC<AppHeaderProps> = ({ onLogout }) => {
  const router = useRouter();
  const toast = useToast();

  const handleLogout = useCallback(async () => {
    try {
      // Cognito 로그아웃 처리 (새로운 방식)
      await signOut();
      // 로컬 스토리지/세션 스토리지 클리어
      if (typeof window !== 'undefined') { // 클라이언트 사이드 체크
        localStorage.removeItem('token');
        sessionStorage.clear();
      }
      
      if(onLogout) {
        await onLogout();
      }

      // 성공 토스트 메시지
      toast({
        title: '로그아웃 되었습니다.',
        status: 'success',
        duration: 3000,
        isClosable: true,
        position: 'top'
      });

      // 상위 컴포넌트에서 전달받은 로그아웃 핸들러가 있다면 실행
      if (onLogout) {
        onLogout();
      }

      // 로그인 페이지로 리다이렉트
      setTimeout(() => {
        router.replace('/login');
      }, 100);
      
    } catch (error) {
      // 에러 처리
      toast({
        title: '로그아웃 중 오류가 발생했습니다.',
        status: 'error',
        duration: 3000,
        isClosable: true,
        position: 'top'
      });
      console.error('Logout error:', error);
    }
  }, [router, toast, onLogout]);

  return (
    <Box bg="black" py={8} position="sticky" top={0} zIndex={1000}>
      <Box maxW="container.lg" mx="auto" px={8}>
        <Flex justify="space-between" align="center">
          <Heading fontSize="1.5rem" color="white" fontWeight="bold">
            CCTV 안전 상황판
          </Heading>
          <Button
            onClick={handleLogout}
            variant="outline"
            colorScheme="yellow"
            size="lg"
            _hover={{ bg: 'yellow.50' }}
          >
            로그아웃
          </Button>
        </Flex>
      </Box>
    </Box>
  );
};

export default AppHeader;
