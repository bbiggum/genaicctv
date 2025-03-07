import { Box, Heading } from '@chakra-ui/react';

const AppHeader = () => {
  return (
    <Box bg="black" py={8} position={'sticky'} zIndex={'sticky'}>
      <Box maxW="container.lg" mx="auto" px={8}>
        {/* <Link href="/" passHref> */}
        <Heading fontSize="1.5rem" color="white" fontWeight={'bold'}>
          CCTV 안전 상황판
        </Heading>
        {/* </Link> */}
      </Box>
    </Box>
  );
};

export default AppHeader;
